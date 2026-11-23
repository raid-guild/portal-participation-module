import { canonicalSha256 } from '../immutable/canonical'

export const SHARE_PRICE_MINOR_UNITS = 250
export const MAX_MONTHLY_MINOR_UNITS = 20_000
export const MAX_MONTHLY_SHARES_RAW = 80n * 10n ** 18n
export const MIN_MEMBERSHIP_RAW = 100n * 10n ** 18n

export type IssuancePolicy = {
  version: string
  paymentBasis: 'gross' | 'net' | 'unresolved'
  sharePriceMinorUnits: number
  maxMonthlyMinorUnits: number
}

export type IssuanceInput = {
  periodKey: string
  cutoffAt: string
  run: {
    id: string; chainId: number; daoAddress: string; sharesTokenAddress: string;
    cutoffBlockNumber: string; cutoffBlockHash: string; thresholdRaw: string; tokenDecimals: number
  }
  policy: IssuancePolicy
  payments: Array<{
    id: string; userId: string; planKey: string; status: string;
    amountMinorUnits: number; currency: string; confirmedAt: string | null;
    rail: string; provider: string; chainId: number | null; transactionHash: string | null;
    blockNumber: string | null
  }>
  snapshots: Array<{
    userId: string; walletLinkId: string; walletAddress: string;
    shareBalanceRaw: string; eligible: boolean
  }>
  wallets: Array<{
    id: string; userId: string; address: string; chainId: number;
    verifiedAt: string | null; revokedAt: string | null
  }>
}

export type IssuancePayload = ReturnType<typeof buildIssuancePayload>

export function getIssuancePolicy(): IssuancePolicy {
  return {
    version: process.env.ISSUANCE_REVIEW_POLICY_VERSION?.trim() || 'proposed-v1',
    paymentBasis: process.env.ISSUANCE_REVIEW_PAYMENT_BASIS === 'gross'
      ? 'gross' : process.env.ISSUANCE_REVIEW_PAYMENT_BASIS === 'net' ? 'net' : 'unresolved',
    sharePriceMinorUnits: SHARE_PRICE_MINOR_UNITS,
    maxMonthlyMinorUnits: MAX_MONTHLY_MINOR_UNITS,
  }
}

export function periodCutoff(periodKey: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw new Error('Period must use YYYY-MM.')
  const [year, month] = periodKey.split('-').map(Number)
  const cutoff = new Date(Date.UTC(year, month, 1))
  if (!Number.isFinite(cutoff.getTime()) || cutoff <= new Date(Date.UTC(year, month - 1, 1))) throw new Error('Invalid period.')
  return cutoff
}

export function buildIssuancePayload(input: IssuanceInput) {
  const blockers: string[] = []
  if (input.policy.paymentBasis !== 'gross') blockers.push('Gross-versus-net payment policy is not approved or net settlement evidence is unavailable.')
  if (input.policy.version.startsWith('proposed')) blockers.push('DAO-approved issuance policy version is not configured.')
  if (input.policy.sharePriceMinorUnits !== SHARE_PRICE_MINOR_UNITS || input.policy.maxMonthlyMinorUnits !== MAX_MONTHLY_MINOR_UNITS) blockers.push('Unsupported rate or monthly cap.')
  if (input.run.chainId !== 100 || input.run.tokenDecimals !== 18 || !input.run.cutoffBlockHash || BigInt(input.run.thresholdRaw) < MIN_MEMBERSHIP_RAW) blockers.push('Membership run has incomplete or below-100-RG canonical chain evidence.')
  const cutoffMs = Date.parse(input.cutoffAt)
  const walletById = new Map(input.wallets.map((wallet) => [wallet.id, wallet]))
  const eligibleByUser = new Map<string, string[]>()
  for (const snapshot of input.snapshots) {
    const wallet = walletById.get(snapshot.walletLinkId)
    if (!wallet || wallet.userId !== snapshot.userId || wallet.chainId !== 100 || !wallet.verifiedAt || wallet.revokedAt || wallet.address.toLowerCase() !== snapshot.walletAddress.toLowerCase()) continue
    if (!snapshot.eligible || BigInt(snapshot.shareBalanceRaw) < MIN_MEMBERSHIP_RAW || BigInt(snapshot.shareBalanceRaw) < BigInt(input.run.thresholdRaw)) continue
    const addresses = eligibleByUser.get(snapshot.userId) ?? []
    addresses.push(snapshot.walletAddress)
    eligibleByUser.set(snapshot.userId, addresses)
  }

  const candidates = input.payments.filter((payment) => payment.planKey.startsWith('member_share_'))
    .sort((a, b) => a.id.localeCompare(b.id))
  const byUser = new Map<string, typeof candidates>()
  for (const payment of candidates) {
    const rows = byUser.get(payment.userId) ?? []
    rows.push(payment)
    byUser.set(payment.userId, rows)
  }
  const included: Array<{ userId: string; recipientAddress: string; paymentIds: string[]; amountMinorUnits: number; shareAmountRaw: string }> = []
  const excluded: Array<{ paymentId: string; userId: string; reason: string }> = []
  const usedRecipients = new Set<string>()
  for (const [userId, rows] of [...byUser.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const valid = rows.filter((payment) => /^member_share_(20|40|60|80|100|120|140|160|180|200)$/.test(payment.planKey) &&
      Number(payment.planKey.slice('member_share_'.length)) * 100 === payment.amountMinorUnits &&
      payment.status === 'confirmed' && payment.currency === 'USD' && payment.confirmedAt !== null && Date.parse(payment.confirmedAt) < cutoffMs &&
      payment.rail === 'stablecoin_direct' && payment.provider === 'gnosis-wxdai-direct' && payment.chainId === 100 &&
      Boolean(payment.transactionHash) && payment.blockNumber !== null)
    for (const payment of rows.filter((payment) => !valid.includes(payment))) excluded.push({ paymentId: payment.id, userId, reason: 'unsupported_or_unconfirmed_payment_evidence' })
    if (!valid.length) continue
    const addresses = [...new Set(eligibleByUser.get(userId) ?? [])].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    const amountMinorUnits = valid.reduce((sum, payment) => sum + payment.amountMinorUnits, 0)
    const reason = addresses.length !== 1 ? 'canonical_member_wallet_missing_or_ambiguous'
      : usedRecipients.has(addresses[0].toLowerCase()) ? 'recipient_address_reused'
      : amountMinorUnits <= 0 || amountMinorUnits > MAX_MONTHLY_MINOR_UNITS ? 'monthly_cap_or_amount_invalid'
        : amountMinorUnits % SHARE_PRICE_MINOR_UNITS !== 0 ? 'amount_not_divisible_by_share_price' : null
    if (reason) {
      for (const payment of valid) excluded.push({ paymentId: payment.id, userId, reason })
      continue
    }
    const shareAmountRaw = BigInt(amountMinorUnits) * 10n ** 18n / BigInt(SHARE_PRICE_MINOR_UNITS)
    if (shareAmountRaw > MAX_MONTHLY_SHARES_RAW) {
      for (const payment of valid) excluded.push({ paymentId: payment.id, userId, reason: 'share_cap_exceeded' })
      continue
    }
    usedRecipients.add(addresses[0].toLowerCase())
    included.push({ userId, recipientAddress: addresses[0], paymentIds: valid.map((payment) => payment.id).sort(), amountMinorUnits, shareAmountRaw: shareAmountRaw.toString() })
  }
  included.sort((a, b) => a.recipientAddress.toLowerCase().localeCompare(b.recipientAddress.toLowerCase()))
  excluded.sort((a, b) => a.paymentId.localeCompare(b.paymentId))
  if (!included.length) blockers.push('No eligible confirmed member contributions were found for this month.')
  if (excluded.length) blockers.push('Unresolved excluded member-plan payments require independent review.')
  return {
    schemaVersion: 1 as const,
    periodKey: input.periodKey,
    cutoffAt: input.cutoffAt,
    membership: input.run,
    policy: input.policy,
    included,
    excluded,
    blockers,
  }
}

export function issuancePayloadHash(payload: IssuancePayload): string {
  return canonicalSha256(payload)
}

export function issuanceSourceManifest(payload: IssuancePayload): Array<{ paymentId: string; included: boolean }> {
  const sources = [
    ...payload.included.flatMap((line) => line.paymentIds.map((paymentId) => ({ paymentId, included: true }))),
    ...payload.excluded.map((line) => ({ paymentId: line.paymentId, included: false })),
  ].sort((a, b) => a.paymentId.localeCompare(b.paymentId))
  if (new Set(sources.map((source) => source.paymentId)).size !== sources.length) {
    throw new Error('Frozen issuance payload contains a duplicate source payment.')
  }
  return sources
}
