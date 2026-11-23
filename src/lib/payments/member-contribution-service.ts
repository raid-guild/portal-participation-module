import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { currentPeriodKey } from '../admin/report'
import { getLatestSuccessfulMembershipRun, GNOSIS_CHAIN_ID } from '../dao/membership'
import { getDatabase } from '../db/client'
import { daoMembershipSnapshots, memberContributionCheckouts, memberContributionEvents, users, walletLinks } from '../db/schema'
import { canonicalSha256 } from '../immutable/canonical'
import { contributionAmount, parseMemberContributionEvent, projectContributionStatus } from './member-contribution-contract'

export class MemberContributionError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export function memberContributionEnabled(): boolean {
  const mode = process.env.MEMBER_CONTRIBUTION_MODE ?? 'disabled'
  if (!['disabled', 'shopify_test'].includes(mode)) throw new MemberContributionError('Live member contribution checkout is unavailable.', 503)
  return mode === 'shopify_test'
}

function commerceConfiguration() {
  if (!memberContributionEnabled()) throw new MemberContributionError('Card contribution pilot is disabled.', 503)
  const base = process.env.COMMERCE_BASE_URL
  const key = process.env.COMMERCE_CONTRIBUTION_CHECKOUT_KEY
  const shop = process.env.COMMERCE_SHOP_DOMAIN
  if (!base || !key || !shop) throw new MemberContributionError('Commerce integration is not configured.', 503)
  const url = new URL(base)
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.origin === 'http://localhost:3001')) {
    throw new MemberContributionError('Commerce HTTPS origin required.', 503)
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) throw new MemberContributionError('Shopify shop is not configured.', 503)
  return { base: url.origin, key, shop: shop.toLowerCase() }
}

export function verifiedInvoiceUrl(raw: string, shopDomain: string): string {
  let url: URL
  try { url = new URL(raw) } catch { throw new MemberContributionError('Invalid Shopify checkout URL.', 503) }
  if (url.protocol !== 'https:' || url.hostname !== shopDomain.toLowerCase() || url.port || url.username || url.password || url.hash) {
    throw new MemberContributionError('Invalid Shopify checkout URL.', 503)
  }
  return url.toString()
}

export async function requireCanonicalContributionMember(userId: string) {
  const database = getDatabase()
  const run = await getLatestSuccessfulMembershipRun()
  if (!run) throw new MemberContributionError('DAO membership snapshot is unavailable.', 409)
  const [member] = await database.select({
    walletId: walletLinks.id,
    walletAddress: walletLinks.address,
    runId: daoMembershipSnapshots.runId,
  }).from(daoMembershipSnapshots).innerJoin(walletLinks, eq(daoMembershipSnapshots.walletLinkId, walletLinks.id))
    .where(and(eq(daoMembershipSnapshots.runId, run.id), eq(daoMembershipSnapshots.userId, userId),
      eq(daoMembershipSnapshots.eligible, true), eq(walletLinks.userId, userId),
      eq(walletLinks.chainId, GNOSIS_CHAIN_ID), isNull(walletLinks.revokedAt),
      sql`${walletLinks.verifiedAt} IS NOT NULL`,
      sql`${daoMembershipSnapshots.shareBalanceRaw} >= ${run.thresholdRaw}`))
    .limit(1)
  if (!member) throw new MemberContributionError('A currently verified wallet with at least 100 RG is required.', 403)
  return member
}

export async function beginTestMemberContribution(userId: string, requestedAmount: unknown) {
  const config = commerceConfiguration()
  let amount: number
  try { amount = contributionAmount(requestedAmount) } catch (error) {
    throw new MemberContributionError(error instanceof Error ? error.message : 'Invalid amount.', 422)
  }
  const database = getDatabase()
  const [user] = await database.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user || !user.email) throw new MemberContributionError('Portal email is required for a Shopify test receipt.', 409)
  const member = await requireCanonicalContributionMember(userId)
  const periodKey = currentPeriodKey()
  const planKey = `member_share_${amount}`
  const checkout = await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext(${periodKey}))`)
    const [existing] = await tx.select().from(memberContributionCheckouts)
      .where(and(eq(memberContributionCheckouts.userId, userId), eq(memberContributionCheckouts.periodKey, periodKey))).limit(1)
    if (existing) {
      if (existing.amountMinor !== amount * 100) throw new MemberContributionError('A different monthly test checkout already exists.', 409)
      return existing
    }
    const [created] = await tx.insert(memberContributionCheckouts).values({
      userId, portalIssuer: process.env.PORTAL_LAUNCH_ISSUER ?? 'https://portal.raidguild.org',
      portalUserId: user.portalUserId, walletLinkId: member.walletId, membershipRunId: member.runId,
      periodKey, planKey, amountMinor: amount * 100,
      authorizationExpiresAt: new Date(Date.now() + 10 * 60_000),
    }).returning()
    return created
  })
  if (checkout.status !== 'creating') return publicTestCheckout(checkout)
  // An unknown Shopify draft-create outcome stays held for review. Repeated
  // requests reuse the same authorization; Commerce is independently idempotent.
  const request = {
    schemaVersion: 1, authorizationId: checkout.id, environment: 'shopify_test',
    portalIssuer: checkout.portalIssuer, portalUserId: checkout.portalUserId,
    planKey: checkout.planKey, periodKey: checkout.periodKey,
    currency: 'USD', amountMinor: checkout.amountMinor,
    receiptEmail: user.email, authorizedAt: checkout.authorizedAt.toISOString(),
    authorizationExpiresAt: checkout.authorizationExpiresAt.toISOString(),
  }
  async function holdForReview(code: string): Promise<never> {
    await database.update(memberContributionCheckouts).set({ status: 'needs_review', errorCode: code, updatedAt: new Date() })
      .where(and(eq(memberContributionCheckouts.id, checkout.id), eq(memberContributionCheckouts.status, 'creating')))
    throw new MemberContributionError('Checkout needs review. Do not retry or pay again; contact an admin.', 503)
  }
  let response: Response
  try {
    response = await fetch(`${config.base}/api/v1/member-contributions/checkouts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: JSON.stringify(request), cache: 'no-store', signal: AbortSignal.timeout(12_000),
    })
  } catch { return holdForReview('COMMERCE_OUTCOME_UNKNOWN') }
  if (!response.ok) return holdForReview('COMMERCE_REJECTED')
  let result: { commerceCheckoutId?: string; status?: string; checkoutUrl?: string | null; environment?: string }
  try { result = await response.json() } catch { return holdForReview('COMMERCE_INVALID_RESPONSE') }
  if (!result || !/^mcc_[0-9a-f-]{36}$/i.test(result.commerceCheckoutId ?? '') || result.environment !== 'shopify_test') {
    return holdForReview('COMMERCE_INVALID_RESPONSE')
  }
  if (result.status === 'creating' && !result.checkoutUrl) {
    // A concurrent Commerce request has already reserved this authorization.
    // Its first caller may still finish draft creation and return the invoice.
    const [latest] = await database.select().from(memberContributionCheckouts).where(eq(memberContributionCheckouts.id, checkout.id)).limit(1)
    return publicTestCheckout(latest)
  }
  if (result.status !== 'pending' || !result.checkoutUrl) {
    return holdForReview(result.status === 'needs_review' ? 'COMMERCE_NEEDS_REVIEW' : 'COMMERCE_INVALID_RESPONSE')
  }
  let checkoutUrl: string
  try { checkoutUrl = verifiedInvoiceUrl(result.checkoutUrl, config.shop) } catch { return holdForReview('COMMERCE_WRONG_SHOP') }
  const [saved] = await database.update(memberContributionCheckouts).set({
    commerceCheckoutId: result.commerceCheckoutId, checkoutUrl, status: 'pending', updatedAt: new Date(),
  }).where(and(eq(memberContributionCheckouts.id, checkout.id), eq(memberContributionCheckouts.status, 'creating'))).returning()
  if (saved) return publicTestCheckout(saved)
  const [latest] = await database.select().from(memberContributionCheckouts).where(eq(memberContributionCheckouts.id, checkout.id)).limit(1)
  return publicTestCheckout(latest)
}

type Checkout = typeof memberContributionCheckouts.$inferSelect
export function publicTestCheckout(row: Checkout) {
  return { id: row.id, status: row.status, amountUSD: row.amountMinor / 100, periodKey: row.periodKey,
    checkoutUrl: row.status === 'pending' ? row.checkoutUrl : null, orderId: row.orderId, refundedUSD: row.cumulativeRefundedSubtotalMinor / 100,
    errorCode: row.errorCode,
    environment: 'shopify_test' as const, notice: 'Shopify test payment only. No live billing, access, or RG shares are credited.' }
}

export async function getTestMemberContributions(userId: string) {
  if (!memberContributionEnabled()) return []
  const rows = await getDatabase().select().from(memberContributionCheckouts)
    .where(eq(memberContributionCheckouts.userId, userId)).orderBy(desc(memberContributionCheckouts.createdAt)).limit(12)
  return rows.map(publicTestCheckout)
}

export async function acceptTestMemberContributionEvent(input: unknown) {
  if (!memberContributionEnabled()) throw new MemberContributionError('Test billing inbox is disabled.', 503)
  let event
  try { event = parseMemberContributionEvent(input) } catch { throw new MemberContributionError('Invalid billing event.', 422) }
  const config = commerceConfiguration()
  if (event.shopDomain.toLowerCase() !== config.shop) throw new MemberContributionError('Wrong Shopify shop.', 403)
  const hash = canonicalSha256(event)
  return getDatabase().transaction(async (tx) => {
    // Serialize every event for this authorization before rereading its state.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${event.authorizationId}), 41127)`)
    const [prior] = await tx.select().from(memberContributionEvents).where(eq(memberContributionEvents.sourceEventId, event.eventId)).limit(1)
    if (prior) {
      if (prior.payloadSha256 !== hash) throw new MemberContributionError('Conflicting event ID.', 409)
      return { accepted: true, duplicate: true }
    }
    const [checkout] = await tx.select().from(memberContributionCheckouts).where(eq(memberContributionCheckouts.id, event.authorizationId)).limit(1)
    if (!checkout || checkout.commerceCheckoutId !== event.commerceCheckoutId) throw new MemberContributionError('Unknown or mismatched test checkout.', 409)
    if (checkout.orderId && checkout.orderId !== event.orderId) throw new MemberContributionError('Conflicting Shopify order.', 409)
    if (event.cumulativeRefundedSubtotalMinor < checkout.cumulativeRefundedSubtotalMinor) throw new MemberContributionError('Refund evidence regressed.', 409)
    if (event.cumulativeRefundedTaxMinor < checkout.cumulativeRefundedTaxMinor) throw new MemberContributionError('Refund tax evidence regressed.', 409)
    const status = projectContributionStatus(checkout.status, event, checkout.amountMinor)
    await tx.insert(memberContributionEvents).values({ sourceEventId: event.eventId, checkoutId: checkout.id, eventType: event.type, payload: event, payloadSha256: hash })
    await tx.update(memberContributionCheckouts).set({
      status, orderId: event.orderId,
      cumulativeRefundedSubtotalMinor: event.cumulativeRefundedSubtotalMinor,
      cumulativeRefundedTaxMinor: event.cumulativeRefundedTaxMinor,
      taxMinor: event.taxMinor,
      capturedAt: status === 'captured' ? new Date(event.occurredAt) : checkout.capturedAt,
      updatedAt: new Date(),
    }).where(eq(memberContributionCheckouts.id, checkout.id))
    return { accepted: true, duplicate: false, status }
  })
}
