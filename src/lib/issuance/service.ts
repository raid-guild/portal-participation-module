import { and, desc, eq, sql } from 'drizzle-orm'
import { getAddress } from 'viem'

import { getMembershipConfig } from '../dao/membership'
import { getDatabase } from '../db/client'
import {
  appRoleAssignments, auditEvents, daoMembershipRuns, daoMembershipSnapshots,
  issuanceReviewDecisions, issuanceReviewSnapshots, issuanceReviewSources,
  payments, walletLinks,
} from '../db/schema'
import { buildIssuancePayload, getIssuancePolicy, issuancePayloadHash, issuanceSourceManifest, periodCutoff, type IssuanceInput, type IssuancePayload } from './build'

export class IssuanceReviewError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}

export function assertIndependentReviewer(creatorUserId: string, reviewerUserId: string) {
  if (creatorUserId === reviewerUserId) throw new IssuanceReviewError('The creator cannot review their own snapshot.', 403)
}

export function snapshotIsStale(snapshot: {
  payloadSha256: string; policyVersion: string; paymentBasis: string
}, currentPayloadHash: string, activePolicy = getIssuancePolicy()): boolean {
  return snapshot.payloadSha256 !== currentPayloadHash ||
    snapshot.policyVersion !== activePolicy.version || snapshot.paymentBasis !== activePolicy.paymentBasis
}

type DbTransaction = Parameters<Parameters<ReturnType<typeof getDatabase>['transaction']>[0]>[0]

async function requireCurrentAdmin(transaction: DbTransaction, userId: string) {
  const [role] = await transaction.select({ id: appRoleAssignments.id }).from(appRoleAssignments).where(and(
    eq(appRoleAssignments.userId, userId), eq(appRoleAssignments.role, 'app_admin'),
  )).limit(1)
  if (!role) throw new IssuanceReviewError('Current app-admin role required.', 403)
}

async function currentPayload(transaction: DbTransaction, periodKey: string, cutoffAt: Date, membershipRunId?: string, policy = getIssuancePolicy()) {
  const [run] = await transaction.select().from(daoMembershipRuns).where(membershipRunId
    ? eq(daoMembershipRuns.id, membershipRunId)
    : eq(daoMembershipRuns.status, 'succeeded')).orderBy(desc(daoMembershipRuns.completedAt)).limit(1)
  if (!run || run.status !== 'succeeded' || !run.cutoffBlockNumber || !run.cutoffBlockHash || !run.tokenDecimals || !run.completedAt || run.completedAt < cutoffAt) {
    throw new IssuanceReviewError('A successful membership run completed after the monthly cutoff is required.')
  }
  const chainConfig = getMembershipConfig()
  if (run.chainId !== 100 || getAddress(run.daoAddress) !== chainConfig.daoAddress || getAddress(run.sharesTokenAddress) !== chainConfig.sharesTokenAddress) {
    throw new IssuanceReviewError('Membership run does not match the configured RaidGuild DAO and shares token.')
  }
  const [periodPayments, snapshots, wallets] = await Promise.all([
    transaction.select().from(payments).where(eq(payments.periodKey, periodKey)),
    transaction.select().from(daoMembershipSnapshots).where(eq(daoMembershipSnapshots.runId, run.id)),
    transaction.select().from(walletLinks),
  ])
  const input: IssuanceInput = {
    periodKey, cutoffAt: cutoffAt.toISOString(), policy,
    run: {
      id: run.id, chainId: run.chainId, daoAddress: run.daoAddress,
      sharesTokenAddress: run.sharesTokenAddress,
      cutoffBlockNumber: run.cutoffBlockNumber.toString(), cutoffBlockHash: run.cutoffBlockHash,
      thresholdRaw: run.thresholdRaw, tokenDecimals: run.tokenDecimals,
    },
    payments: periodPayments.map((payment) => ({
      id: payment.id, userId: payment.userId, planKey: payment.planKey,
      status: payment.status, amountMinorUnits: payment.amountMinorUnits,
      currency: payment.currency, confirmedAt: payment.confirmedAt?.toISOString() ?? null,
      rail: payment.rail, provider: payment.provider, chainId: payment.chainId,
      transactionHash: payment.transactionHash, blockNumber: payment.blockNumber?.toString() ?? null,
    })),
    snapshots: snapshots.map((snapshot) => ({
      userId: snapshot.userId, walletLinkId: snapshot.walletLinkId,
      walletAddress: snapshot.walletAddress, shareBalanceRaw: snapshot.shareBalanceRaw,
      eligible: snapshot.eligible,
    })),
    wallets: wallets.map((wallet) => ({
      id: wallet.id, userId: wallet.userId, address: wallet.address, chainId: wallet.chainId,
      verifiedAt: wallet.verifiedAt?.toISOString() ?? null,
      revokedAt: wallet.revokedAt?.toISOString() ?? null,
    })),
  }
  return { payload: buildIssuancePayload(input) }
}

export async function freezeIssuanceReview(periodKey: string, creatorUserId: string) {
  let cutoffAt: Date
  try { cutoffAt = periodCutoff(periodKey) }
  catch { throw new IssuanceReviewError('Period must use a valid YYYY-MM.', 400) }
  if (cutoffAt > new Date()) throw new IssuanceReviewError('The UTC participation month must close before freezing a review.')
  const database = getDatabase()
  return database.transaction(async (transaction) => {
    await requireCurrentAdmin(transaction, creatorUserId)
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${periodKey}), 91843)`)
    const [previous] = await transaction.select().from(issuanceReviewSnapshots).where(eq(issuanceReviewSnapshots.periodKey, periodKey))
      .orderBy(desc(issuanceReviewSnapshots.revision)).limit(1)
    const { payload } = await currentPayload(transaction, periodKey, cutoffAt)
    const payloadSha256 = issuancePayloadHash(payload)
    const [previousDecision] = previous ? await transaction.select().from(issuanceReviewDecisions)
      .where(eq(issuanceReviewDecisions.snapshotId, previous.id)).limit(1) : []
    if (previous?.payloadSha256 === payloadSha256 && !previousDecision) return previous
    const [snapshot] = await transaction.insert(issuanceReviewSnapshots).values({
      periodKey, revision: (previous?.revision ?? 0) + 1,
      supersedesId: previous?.id ?? null, cutoffAt,
      membershipRunId: payload.membership.id, policyVersion: payload.policy.version,
      paymentBasis: payload.policy.paymentBasis, payload, payloadSha256,
      createdByUserId: creatorUserId,
    }).returning()
    const sources = issuanceSourceManifest(payload)
    if (sources.length) await transaction.insert(issuanceReviewSources).values(sources.map((source) => ({
      snapshotId: snapshot.id, ...source,
    })))
    await transaction.insert(auditEvents).values({
      action: 'issuance_review.frozen', actorType: 'portal_user', actorId: creatorUserId,
      entityType: 'issuance_review_snapshot', entityId: snapshot.id,
      details: { periodKey, revision: snapshot.revision, payloadSha256, blockers: payload.blockers },
    })
    return snapshot
  })
}

export async function listIssuanceReviews() {
  return getDatabase().select().from(issuanceReviewSnapshots).orderBy(desc(issuanceReviewSnapshots.createdAt)).limit(36)
}

export async function getIssuanceReviewInTransaction(transaction: DbTransaction, snapshotId: string) {
  const [snapshot] = await transaction.select().from(issuanceReviewSnapshots).where(eq(issuanceReviewSnapshots.id, snapshotId)).limit(1)
  if (!snapshot) throw new IssuanceReviewError('Frozen issuance review not found.', 404)
  const [latest] = await transaction.select().from(issuanceReviewSnapshots).where(eq(issuanceReviewSnapshots.periodKey, snapshot.periodKey))
    .orderBy(desc(issuanceReviewSnapshots.revision)).limit(1)
  const decisions = await transaction.select().from(issuanceReviewDecisions).where(eq(issuanceReviewDecisions.snapshotId, snapshotId))
  let stale = false
  try {
    const { payload: current } = await currentPayload(
      transaction, snapshot.periodKey, snapshot.cutoffAt, snapshot.membershipRunId,
      (snapshot.payload as IssuancePayload).policy,
    )
    stale = snapshotIsStale(snapshot, issuancePayloadHash(current))
  } catch {
    stale = true
  }
  const activePolicy = getIssuancePolicy()
  if (activePolicy.version !== snapshot.policyVersion || activePolicy.paymentBasis !== snapshot.paymentBasis) stale = true
  return { snapshot, decisions, stale, latest: latest?.id === snapshot.id }
}

export async function getIssuanceReview(snapshotId: string) {
  return getDatabase().transaction((transaction) => getIssuanceReviewInTransaction(transaction, snapshotId))
}

export async function reviewIssuanceSnapshot(snapshotId: string, reviewerUserId: string, decision: 'approved' | 'rejected', note: string) {
  const database = getDatabase()
  return database.transaction(async (transaction) => {
    await requireCurrentAdmin(transaction, reviewerUserId)
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${snapshotId}), 91844)`)
    const [snapshot] = await transaction.select().from(issuanceReviewSnapshots).where(eq(issuanceReviewSnapshots.id, snapshotId)).limit(1)
    if (!snapshot) throw new IssuanceReviewError('Frozen issuance review not found.', 404)
    assertIndependentReviewer(snapshot.createdByUserId, reviewerUserId)
    const [latest] = await transaction.select().from(issuanceReviewSnapshots).where(eq(issuanceReviewSnapshots.periodKey, snapshot.periodKey))
      .orderBy(desc(issuanceReviewSnapshots.revision)).limit(1)
    if (latest?.id !== snapshot.id) throw new IssuanceReviewError('This revision was superseded.')
    const payload = snapshot.payload as IssuancePayload
    if (decision === 'approved' && payload.blockers.length) throw new IssuanceReviewError(`Approval blocked: ${payload.blockers.join(' ')}`)
    if (decision === 'approved') {
      const activePolicy = getIssuancePolicy()
      if (activePolicy.version !== snapshot.policyVersion || activePolicy.paymentBasis !== snapshot.paymentBasis) {
        throw new IssuanceReviewError('Issuance policy changed; freeze a new revision.')
      }
      const { payload: current } = await currentPayload(transaction, snapshot.periodKey, snapshot.cutoffAt, snapshot.membershipRunId, payload.policy)
      if (snapshotIsStale(snapshot, issuancePayloadHash(current), activePolicy)) throw new IssuanceReviewError('Frozen review is stale; create a new revision.')
    }
    const [existing] = await transaction.select().from(issuanceReviewDecisions).where(eq(issuanceReviewDecisions.snapshotId, snapshot.id)).limit(1)
    if (existing) throw new IssuanceReviewError('This revision already has an independent decision; freeze a new revision to change it.')
    const [record] = await transaction.insert(issuanceReviewDecisions).values({
      snapshotId: snapshot.id, payloadSha256: snapshot.payloadSha256,
      reviewerUserId, decision, note: note.trim(),
    }).returning()
    await transaction.insert(auditEvents).values({
      action: `issuance_review.${decision}`, actorType: 'portal_user', actorId: reviewerUserId,
      entityType: 'issuance_review_snapshot', entityId: snapshot.id,
      details: { payloadSha256: snapshot.payloadSha256, note: note.trim() },
    })
    return record
  })
}
