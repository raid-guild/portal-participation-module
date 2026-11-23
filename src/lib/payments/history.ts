import { and, desc, eq, inArray } from 'drizzle-orm'

import { getDatabase } from '../db/client'
import { paymentIntents, paymentObservations, payments } from '../db/schema'

export type PaymentHistoryItem = {
  id: string
  periodKey: string
  amountMinorUnits: number
  currency: string
  asset: string
  status: string
  transactionHash: string | null
  payer: string | null
  treasury: string | null
  createdAt: string
  confirmedAt: string | null
  confirmations: number
  requiredConfirmations: number
  minedAt: string | null
}

export async function getPaymentHistory(userId: string): Promise<PaymentHistoryItem[]> {
  const db = getDatabase()
  const intents = await db.select().from(paymentIntents).where(and(
    eq(paymentIntents.userId, userId), eq(paymentIntents.rail, 'stablecoin_direct'),
  )).orderBy(desc(paymentIntents.createdAt)).limit(24)
  if (!intents.length) return []
  const intentIds = intents.map((intent) => intent.id)
  const [observations, confirmed] = await Promise.all([
    db.select().from(paymentObservations).where(inArray(paymentObservations.intentId, intentIds)),
    db.select().from(payments).where(and(eq(payments.userId, userId), inArray(payments.intentId, intentIds))),
  ])
  const observationsByIntent = new Map(observations.map((observation) => [observation.intentId, observation]))
  const paymentsByIntent = new Map(confirmed.map((payment) => [payment.intentId, payment]))
  const now = new Date()
  return intents.map((intent) => {
    const observation = observationsByIntent.get(intent.id)
    const payment = paymentsByIntent.get(intent.id)
    return {
      id: intent.id,
      periodKey: intent.periodKey,
      amountMinorUnits: intent.amountMinorUnits,
      currency: intent.currency,
      asset: 'wxDAI',
      status: observation?.status === 'needs_review' || observation?.status === 'rejected'
        ? observation.status
        : payment?.status ?? observation?.status ?? (intent.expiresAt && intent.expiresAt <= now ? 'expired' : intent.status),
      transactionHash: payment?.transactionHash ?? observation?.transactionHash ?? null,
      payer: intent.expectedSender,
      treasury: intent.recipient,
      createdAt: intent.createdAt.toISOString(),
      confirmedAt: payment?.confirmedAt?.toISOString() ?? null,
      confirmations: observation?.confirmations ?? 0,
      requiredConfirmations: requiredConfirmations(),
      minedAt: observation?.minedAt?.toISOString() ?? null,
    }
  })
}

function requiredConfirmations(): number {
  const value = Number(process.env.GNOSIS_PAYMENT_CONFIRMATIONS ?? 12)
  return Number.isInteger(value) && value > 0 ? value : 12
}
