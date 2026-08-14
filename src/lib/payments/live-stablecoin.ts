import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  createPublicClient,
  decodeFunctionData,
  getAddress,
  http,
  isHash,
  parseAbi,
  type Hash,
} from 'viem'
import { gnosis } from 'viem/chains'

import { currentPeriodKey } from '../admin/report'
import { getParticipantDashboardState } from '../dashboard/service'
import { getDatabase } from '../db/client'
import { auditEvents, paymentIntents, payments, users, walletLinks } from '../db/schema'
import { resolveParticipationClass } from '../domain/participation'
import { getPaymentPlan, isPaymentPlanKey } from './plans'
import {
  GNOSIS_CHAIN_ID,
  RAIDGUILD_TREASURY,
  StablecoinDirectAdapter,
  WXDAI_ADDRESS,
} from './stablecoin-direct-adapter'
import type { PaymentPlanKey } from './types'

const transferAbi = parseAbi(['function transfer(address to, uint256 value) returns (bool)'])

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
  const [alreadyPaid] = await database
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.periodKey, periodKey),
        eq(payments.status, 'confirmed'),
      ),
    )
    .limit(1)
  if (alreadyPaid) throw new PaymentValidationError('This participation period is already paid.', 409)

  const adapter = new StablecoinDirectAdapter()
  const session = await adapter.createPaymentSession({
    cancelURL: '/',
    expectedWalletAddress: wallet.address,
    planKey,
    portalUserID: user.portalUserId,
    successURL: '/',
  })
  if (session.kind !== 'onchain_transfer') throw new Error('Stablecoin adapter returned an invalid session.')
  const [intent] = await database
    .insert(paymentIntents)
    .values({
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
    })
    .returning()
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
  const hash = transactionHash as Hash
  const database = getDatabase()
  const [intent] = await database
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.id, intentId), eq(paymentIntents.userId, userId)))
    .limit(1)
  if (!intent) throw new PaymentValidationError('Payment intent not found.', 404)

  const [existing] = await database
    .select()
    .from(payments)
    .where(and(eq(payments.chainId, GNOSIS_CHAIN_ID), eq(payments.transactionHash, hash)))
    .limit(1)
  if (existing) {
    if (existing.intentId !== intent.id) throw new PaymentValidationError('Transaction is already assigned.', 409)
    return { confirmations: requiredConfirmations(), status: 'confirmed' as const }
  }
  if (intent.status === 'confirmed') throw new PaymentValidationError('Payment intent is already confirmed.', 409)
  if (!intent.expiresAt || intent.expiresAt <= new Date()) {
    await database.update(paymentIntents).set({ status: 'expired', updatedAt: new Date() }).where(eq(paymentIntents.id, intent.id))
    throw new PaymentValidationError('Payment intent has expired.', 410)
  }

  const client = createPublicClient({ chain: gnosis, transport: http(rpcUrl()) })
  let transaction
  let receipt
  try {
    ;[transaction, receipt] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash }),
    ])
  } catch {
    return { confirmations: 0, status: 'pending' as const }
  }
  if (receipt.status !== 'success') throw new PaymentValidationError('Transaction execution failed.', 422)
  if (!intent.expectedSender) throw new PaymentValidationError('Payment intent has no expected sender.', 422)
  validateTransferCall({
    expectedAmountAtomic: intent.amountAtomic!,
    expectedRecipient: configuredTreasury(),
    expectedSender: getAddress(intent.expectedSender),
    expectedToken: configuredToken(),
    from: transaction.from,
    input: transaction.input,
    to: transaction.to,
  })

  const head = await client.getBlockNumber()
  const confirmations = Number(head - receipt.blockNumber + 1n)
  if (confirmations < requiredConfirmations()) {
    await database.update(paymentIntents).set({ status: 'observed', updatedAt: new Date() }).where(eq(paymentIntents.id, intent.id))
    return { confirmations, status: 'confirming' as const }
  }

  const confirmedAt = new Date()
  await database.transaction(async (transactionDb) => {
    await transactionDb.insert(payments).values({
      amountAtomic: intent.amountAtomic,
      amountMinorUnits: intent.amountMinorUnits,
      blockNumber: receipt.blockNumber,
      chainId: GNOSIS_CHAIN_ID,
      confirmedAt,
      currency: intent.currency,
      intentId: intent.id,
      payerWalletAddress: getAddress(transaction.from),
      periodKey: intent.periodKey,
      planKey: intent.planKey,
      provider: intent.provider,
      providerPaymentReference: hash,
      rail: 'stablecoin_direct',
      status: 'confirmed',
      transactionHash: hash,
      userId,
    })
    await transactionDb
      .update(paymentIntents)
      .set({ status: 'confirmed', updatedAt: confirmedAt })
      .where(and(eq(paymentIntents.id, intent.id), inArray(paymentIntents.status, ['pending', 'observed'])))
    await transactionDb.insert(auditEvents).values({
      action: 'payment.confirmed',
      actorId: intent.expectedSender,
      actorType: 'wallet',
      details: { blockNumber: receipt.blockNumber.toString(), periodKey: intent.periodKey, transactionHash: hash },
      entityId: intent.id,
      entityType: 'payment_intent',
    })
  })
  return { confirmations, status: 'confirmed' as const }
}

function configuredTreasury() {
  return getAddress(process.env.GNOSIS_TREASURY_ADDRESS ?? RAIDGUILD_TREASURY)
}

export function validateTransferCall(input: {
  expectedAmountAtomic: string
  expectedRecipient: `0x${string}`
  expectedSender: `0x${string}`
  expectedToken: `0x${string}`
  from: `0x${string}`
  input: `0x${string}`
  to: `0x${string}` | null
}) {
  if (!input.to || getAddress(input.to) !== getAddress(input.expectedToken)) {
    throw new PaymentValidationError('Transaction did not call the configured wxDAI token.', 422)
  }
  if (getAddress(input.from) !== getAddress(input.expectedSender)) {
    throw new PaymentValidationError('Transaction sender does not match the verified Portal wallet.', 422)
  }
  let decoded
  try {
    decoded = decodeFunctionData({ abi: transferAbi, data: input.input })
  } catch {
    throw new PaymentValidationError('Transaction is not a wxDAI transfer.', 422)
  }
  if (decoded.functionName !== 'transfer') throw new PaymentValidationError('Transaction is not a wxDAI transfer.', 422)
  const [recipient, amount] = decoded.args
  if (getAddress(recipient) !== getAddress(input.expectedRecipient)) {
    throw new PaymentValidationError('Transfer recipient does not match the RaidGuild treasury.', 422)
  }
  if (amount.toString() !== input.expectedAmountAtomic) {
    throw new PaymentValidationError('Transfer amount does not match the payment intent.', 422)
  }
}

function configuredToken() {
  return getAddress(process.env.GNOSIS_WXDAI_ADDRESS ?? WXDAI_ADDRESS)
}

function rpcUrl() {
  return process.env.GNOSIS_CHAIN_RPC_URL ?? 'https://rpc.gnosischain.com'
}

function requiredConfirmations() {
  return Number(process.env.GNOSIS_PAYMENT_CONFIRMATIONS ?? 12)
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
