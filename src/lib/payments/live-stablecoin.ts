import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import {
  createPublicClient,
  getAddress,
  http,
  isHash,
  type Hash,
} from 'viem'
import { gnosis } from 'viem/chains'

import { currentPeriodKey } from '../admin/report'
import { getParticipantDashboardState } from '../dashboard/service'
import { getDatabase } from '../db/client'
import { auditEvents, paymentIntents, paymentObservations, payments, users, walletLinks } from '../db/schema'
import { resolveParticipationClass } from '../domain/participation'
import { getPaymentPlan, isPaymentPlanKey } from './plans'
import {
  GNOSIS_CHAIN_ID,
  RAIDGUILD_TREASURY,
  StablecoinDirectAdapter,
  WXDAI_ADDRESS,
} from './stablecoin-direct-adapter'
import type { PaymentPlanKey } from './types'
import { TransferEvidenceError, verifyDirectWxDaiTransfer } from './verify-transfer'
import { confirmedEvidenceException, FINALITY_RECHECK_DAYS, FINALITY_RECHECK_INTERVAL_MS } from './finality'

export { validateTransferCall } from './verify-transfer'

export class PaymentValidationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export async function createLivePaymentIntent(userId: string, requestedPlanKey: unknown) {
  if (!isPaymentPlanKey(requestedPlanKey)) throw new PaymentValidationError('Invalid payment plan.')
  const planKey: PaymentPlanKey = requestedPlanKey
  const database = getDatabase()
  const [user] = await database.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw new PaymentValidationError('Participation user not found.', 404)
  const state = await getParticipantDashboardState(user.id, user.credentials)
  const participationClass = resolveParticipationClass(state.credentials)
  const plan = getPaymentPlan(planKey)
  if (plan.eligibleClass !== participationClass) {
    throw new PaymentValidationError('This payment plan is not available for your participation class.', 403)
  }

  const [wallet] = await database
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.userId, userId),
        eq(walletLinks.chainId, GNOSIS_CHAIN_ID),
        isNull(walletLinks.revokedAt),
      ),
    )
    .limit(1)
  if (!wallet?.verifiedAt) {
    throw new PaymentValidationError('A Portal-verified Gnosis wallet is required.', 409)
  }

  const periodKey = currentPeriodKey()
  const adapter = new StablecoinDirectAdapter()
  const session = await adapter.createPaymentSession({
    cancelURL: '/',
    expectedWalletAddress: wallet.address,
    planKey,
    portalUserID: user.portalUserId,
    successURL: '/',
  })
  if (session.kind !== 'onchain_transfer') throw new Error('Stablecoin adapter returned an invalid session.')
  const intent = await database.transaction(async (transactionDb) => {
    await lockUserPeriod(transactionDb, userId, periodKey)
    const [alreadyPaid] = await transactionDb.select({ id: payments.id }).from(payments).where(and(
      eq(payments.userId, userId), eq(payments.periodKey, periodKey), eq(payments.status, 'confirmed'),
    )).limit(1)
    if (alreadyPaid) throw new PaymentValidationError('This participation period is already paid.', 409)
    const [active] = await transactionDb.select().from(paymentIntents).where(and(
      eq(paymentIntents.userId, userId), eq(paymentIntents.periodKey, periodKey),
      inArray(paymentIntents.status, ['pending', 'observed']),
    )).orderBy(sql`${paymentIntents.createdAt} desc`).limit(1)
    if (active && (active.status === 'observed' || (active.expiresAt && active.expiresAt > new Date()))) {
      if (active.planKey !== planKey) throw new PaymentValidationError('An active intent already exists for this month.', 409)
      return active
    }
    const [created] = await transactionDb.insert(paymentIntents).values({
      amountAtomic: session.amountAtomic,
      amountMinorUnits: plan.amount.minorUnits,
      chainId: session.chainId,
      currency: plan.amount.currency,
      expectedSender: getAddress(session.expectedSender),
      expiresAt: new Date(session.expiresAt),
      periodKey,
      planKey,
      provider: adapter.providerName,
      providerReference: session.providerReference,
      rail: adapter.rail,
      recipient: configuredTreasury(),
      tokenAddress: configuredToken(),
      userId,
      walletLinkId: wallet.id,
    }).returning()
    return created
  })
  await database.insert(auditEvents).values({
    action: 'payment_intent.created',
    actorId: user.portalUserId,
    actorType: 'portal_user',
    details: { amountMinorUnits: intent.amountMinorUnits, periodKey, planKey },
    entityId: intent.id,
    entityType: 'payment_intent',
  })

  return publicIntent(intent)
}

export async function confirmLivePayment(userId: string, intentId: unknown, transactionHash: unknown) {
  if (typeof intentId !== 'string' || typeof transactionHash !== 'string' || !isHash(transactionHash)) {
    throw new PaymentValidationError('A valid payment intent and transaction hash are required.')
  }
  const hash = transactionHash.toLowerCase() as Hash
  const database = getDatabase()
  const [intent] = await database
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.id, intentId), eq(paymentIntents.userId, userId)))
    .limit(1)
  if (!intent) throw new PaymentValidationError('Payment intent not found.', 404)

  if (intent.chainId !== GNOSIS_CHAIN_ID || !intent.expectedSender || !intent.recipient || !intent.tokenAddress || !intent.amountAtomic || !intent.expiresAt) {
    throw new PaymentValidationError('Payment intent has incomplete chain evidence.', 422)
  }
  const observation = await database.transaction(async (transactionDb) => {
    await lockUserPeriod(transactionDb, userId, intent.periodKey)
    const [creditedHash] = await transactionDb.select().from(payments).where(and(
      eq(payments.chainId, intent.chainId!), eq(payments.transactionHash, hash),
    )).limit(1)
    if (creditedHash && creditedHash.intentId !== intent.id) throw new PaymentValidationError('Transaction is already assigned.', 409)
    const [creditedIntent] = await transactionDb.select().from(payments).where(eq(payments.intentId, intent.id)).limit(1)
    if (creditedIntent && creditedIntent.transactionHash?.toLowerCase() !== hash) throw new PaymentValidationError('This intent already has a different payment.', 409)
    const [existingHash] = await transactionDb.select().from(paymentObservations).where(and(
      eq(paymentObservations.chainId, intent.chainId!), eq(paymentObservations.transactionHash, hash),
    )).limit(1)
    if (existingHash && existingHash.intentId !== intent.id) throw new PaymentValidationError('Transaction is already assigned.', 409)
    const [existingIntent] = await transactionDb.select().from(paymentObservations).where(eq(paymentObservations.intentId, intent.id)).limit(1)
    if (existingIntent && existingIntent.transactionHash !== hash) throw new PaymentValidationError('This intent already tracks a different transaction.', 409)
    if (existingIntent) return existingIntent
    const [created] = await transactionDb.insert(paymentObservations).values({
      intentId: intent.id, chainId: intent.chainId!, transactionHash: hash,
    }).returning()
    return created
  })
  return { ...(await reconcilePaymentObservation(observation.id)), requiredConfirmations: requiredConfirmations() }
}

export async function reconcilePaymentObservation(observationId: string) {
  const database = getDatabase()
  const [observation] = await database.select().from(paymentObservations).where(eq(paymentObservations.id, observationId)).limit(1)
  if (!observation) throw new PaymentValidationError('Payment observation not found.', 404)
  const [intent] = await database.select().from(paymentIntents).where(eq(paymentIntents.id, observation.intentId)).limit(1)
  if (!intent || !intent.expectedSender || !intent.tokenAddress || !intent.recipient || !intent.amountAtomic || !intent.expiresAt || !intent.chainId) {
    throw new PaymentValidationError('Payment intent has incomplete chain evidence.', 422)
  }
  if (observation.status === 'rejected' || observation.status === 'needs_review') {
    throw new PaymentValidationError(observation.lastError ?? 'Transaction requires manual review.', 422)
  }
  const hash = observation.transactionHash as Hash
  const client = createPublicClient({ chain: gnosis, transport: http(rpcUrl()) })
  let result
  try {
    result = await verifyDirectWxDaiTransfer(client, hash, {
      amountAtomic: intent.amountAtomic,
      chainId: intent.chainId,
      createdAt: intent.createdAt,
      expiresAt: intent.expiresAt,
      expectedSender: intent.expectedSender,
      recipient: intent.recipient,
      tokenAddress: intent.tokenAddress,
    }, requiredConfirmations())
  } catch (error) {
    const isEvidenceError = error instanceof TransferEvidenceError
    if (isEvidenceError) {
      await markObservationNeedsReview(observation.id, intent.userId, intent.periodKey, error.message)
      throw new PaymentValidationError(error.message, 422)
    }
    await database.update(paymentObservations).set({
      lastError: error instanceof Error ? error.message : 'RPC verification failed.',
      attemptCount: observation.attemptCount + 1,
      nextAttemptAt: new Date(Date.now() + 60_000),
      updatedAt: new Date(),
    }).where(and(eq(paymentObservations.id, observation.id), eq(paymentObservations.status, observation.status)))
    throw error
  }
  const now = new Date()
  if (result.status !== 'confirmed') {
    if (observation.status === 'confirmed') {
      const exception = confirmedEvidenceException(observation, result)!
      await markObservationNeedsReview(observation.id, intent.userId, intent.periodKey, exception)
      return { confirmations: result.confirmations, status: 'needs_review' as const }
    }
    await database.update(paymentObservations).set({
      status: result.status, confirmations: result.confirmations,
      blockNumber: result.status === 'confirming' ? result.blockNumber : null,
      blockHash: result.status === 'confirming' ? result.blockHash : null,
      minedAt: result.status === 'confirming' ? result.minedAt : null,
      attemptCount: observation.attemptCount + 1,
      nextAttemptAt: new Date(Date.now() + 30_000), updatedAt: now,
    }).where(and(eq(paymentObservations.id, observation.id), inArray(paymentObservations.status, ['pending', 'confirming'])))
    if (result.status === 'confirming') await database.update(paymentIntents).set({ status: 'observed', updatedAt: now }).where(and(eq(paymentIntents.id, intent.id), inArray(paymentIntents.status, ['pending', 'observed'])))
    return { confirmations: result.confirmations, status: result.status }
  }
  return database.transaction(async (transactionDb) => {
    await lockUserPeriod(transactionDb, intent.userId, intent.periodKey)
    const [lockedObservation] = await transactionDb.select().from(paymentObservations).where(eq(paymentObservations.id, observation.id)).limit(1)
    if (lockedObservation?.status === 'needs_review' || lockedObservation?.status === 'rejected') {
      return { confirmations: result.confirmations, status: 'needs_review' as const }
    }
    const [saved] = await transactionDb.select().from(payments).where(eq(payments.intentId, intent.id)).limit(1)
    if (saved) {
      if (saved.transactionHash?.toLowerCase() !== hash) throw new PaymentValidationError('Intent is already assigned to another payment.', 409)
      if (saved.status !== 'confirmed') return { confirmations: result.confirmations, status: 'needs_review' as const }
      if (!lockedObservation?.blockHash && saved.blockNumber === result.blockNumber) {
        await transactionDb.update(paymentObservations).set({
          status: 'confirmed', confirmations: result.confirmations,
          blockNumber: result.blockNumber, blockHash: result.blockHash, minedAt: result.minedAt,
          attemptCount: (lockedObservation?.attemptCount ?? 0) + 1,
          lastError: null,
          nextAttemptAt: new Date(now.getTime() + FINALITY_RECHECK_INTERVAL_MS), updatedAt: now,
        }).where(eq(paymentObservations.id, observation.id))
        return { confirmations: result.confirmations, status: 'confirmed' as const }
      }
      const exception = confirmedEvidenceException(lockedObservation ?? observation, result)
      if (exception) {
        await transactionDb.update(payments).set({ status: 'failed', updatedAt: now }).where(eq(payments.id, saved.id))
        await transactionDb.update(paymentObservations).set({ status: 'needs_review', lastError: exception, updatedAt: now }).where(eq(paymentObservations.id, observation.id))
        await transactionDb.insert(auditEvents).values({ action: 'payment.chain_exception', actorType: 'system', entityType: 'payment', entityId: saved.id, details: { reason: exception, transactionHash: hash } })
        return { confirmations: result.confirmations, status: 'needs_review' as const }
      }
      await transactionDb.update(paymentObservations).set({
        confirmations: result.confirmations,
        attemptCount: lockedObservation ? lockedObservation.attemptCount + 1 : observation.attemptCount + 1,
        lastError: null,
        nextAttemptAt: new Date(now.getTime() + FINALITY_RECHECK_INTERVAL_MS),
        updatedAt: now,
      }).where(eq(paymentObservations.id, observation.id))
      return { confirmations: result.confirmations, status: 'confirmed' as const }
    }
    const [other] = await transactionDb.select().from(payments).where(and(
      eq(payments.userId, intent.userId), eq(payments.periodKey, intent.periodKey), eq(payments.status, 'confirmed'),
    )).limit(1)
    if (other) {
      await transactionDb.update(paymentObservations).set({ status: 'needs_review', lastError: 'Another payment already covers this period.', updatedAt: now }).where(eq(paymentObservations.id, observation.id))
      return { confirmations: result.confirmations, status: 'needs_review' as const }
    }
    await transactionDb.insert(payments).values({
      amountAtomic: intent.amountAtomic, amountMinorUnits: intent.amountMinorUnits,
      blockNumber: result.blockNumber, chainId: intent.chainId, confirmedAt: now,
      currency: intent.currency, intentId: intent.id, payerWalletAddress: getAddress(intent.expectedSender!),
      periodKey: intent.periodKey, planKey: intent.planKey, provider: intent.provider,
      providerPaymentReference: hash, rail: 'stablecoin_direct', status: 'confirmed',
      transactionHash: hash, userId: intent.userId,
    })
    await transactionDb.update(paymentObservations).set({ status: 'confirmed', confirmations: result.confirmations,
      blockNumber: result.blockNumber, blockHash: result.blockHash, minedAt: result.minedAt,
      attemptCount: observation.attemptCount + 1, lastError: null,
      nextAttemptAt: new Date(now.getTime() + FINALITY_RECHECK_INTERVAL_MS), updatedAt: now,
    }).where(eq(paymentObservations.id, observation.id))
    await transactionDb.update(paymentIntents).set({ status: 'confirmed', updatedAt: now }).where(eq(paymentIntents.id, intent.id))
    await transactionDb.insert(auditEvents).values({
      action: 'payment.confirmed', actorId: intent.expectedSender, actorType: 'wallet',
      details: { blockNumber: result.blockNumber.toString(), blockHash: result.blockHash, periodKey: intent.periodKey, transactionHash: hash },
      entityId: intent.id, entityType: 'payment_intent',
    })
    return { confirmations: result.confirmations, status: 'confirmed' as const }
  })
}

async function markObservationNeedsReview(observationId: string, userId: string, periodKey: string, reason: string) {
  const database = getDatabase()
  await database.transaction(async (transactionDb) => {
    await lockUserPeriod(transactionDb, userId, periodKey)
    const [observation] = await transactionDb.select().from(paymentObservations).where(eq(paymentObservations.id, observationId)).limit(1)
    if (!observation) return
    const [payment] = await transactionDb.select().from(payments).where(eq(payments.intentId, observation.intentId)).limit(1)
    const now = new Date()
    if (observation.status !== 'needs_review') {
      await transactionDb.update(paymentObservations).set({ status: 'needs_review', lastError: reason, updatedAt: now }).where(eq(paymentObservations.id, observationId))
    }
    if (payment?.status === 'confirmed') {
      // The report selects confirmed payments only; retain the row and audit
      // evidence while immediately excluding this contested chain event.
      await transactionDb.update(payments).set({ status: 'failed', updatedAt: now }).where(eq(payments.id, payment.id))
      await transactionDb.insert(auditEvents).values({
        action: 'payment.chain_exception', actorType: 'system', entityType: 'payment', entityId: payment.id,
        details: { reason, transactionHash: observation.transactionHash, priorBlockHash: observation.blockHash },
      })
    }
  })
}

export async function reconcileDuePayments(limit = 25) {
  const database = getDatabase()
  const now = new Date()
  const finalityCutoff = new Date(now.getTime() - FINALITY_RECHECK_DAYS * 24 * 60 * 60 * 1000)
  const due = await database.select({ id: paymentObservations.id }).from(paymentObservations).where(and(
    or(
      inArray(paymentObservations.status, ['pending', 'confirming']),
      and(eq(paymentObservations.status, 'confirmed'), gte(paymentObservations.minedAt, finalityCutoff)),
    ),
    lte(paymentObservations.nextAttemptAt, now),
  )).orderBy(paymentObservations.nextAttemptAt).limit(Math.min(Math.max(limit, 1), 100))
  const results = []
  for (const item of due) {
    try { results.push({ id: item.id, ...(await reconcilePaymentObservation(item.id)) }) }
    catch (error) { results.push({ id: item.id, error: error instanceof Error ? error.message : 'Unknown error' }) }
  }
  return results
}

async function lockUserPeriod(transactionDb: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }, userId: string, periodKey: string) {
  await transactionDb.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext(${periodKey}))`)
}

function configuredTreasury() {
  return getAddress(process.env.GNOSIS_TREASURY_ADDRESS ?? RAIDGUILD_TREASURY)
}

function configuredToken() {
  return getAddress(process.env.GNOSIS_WXDAI_ADDRESS ?? WXDAI_ADDRESS)
}

function rpcUrl() {
  return process.env.GNOSIS_CHAIN_RPC_URL ?? 'https://rpc.gnosischain.com'
}

function requiredConfirmations() {
  const value = Number(process.env.GNOSIS_PAYMENT_CONFIRMATIONS ?? 12)
  return Number.isInteger(value) && value > 0 ? value : 12
}

function publicIntent(intent: typeof paymentIntents.$inferSelect) {
  return {
    amountAtomic: intent.amountAtomic!,
    amountMinorUnits: intent.amountMinorUnits,
    chainId: intent.chainId!,
    expectedSender: intent.expectedSender!,
    expiresAt: intent.expiresAt!.toISOString(),
    id: intent.id,
    periodKey: intent.periodKey,
    planKey: intent.planKey,
    recipient: intent.recipient!,
    tokenAddress: intent.tokenAddress!,
  }
}
