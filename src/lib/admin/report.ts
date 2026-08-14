import { and, eq, isNull } from 'drizzle-orm'
import { formatUnits } from 'viem'

import { getLatestSuccessfulMembershipRun } from '../dao/membership'
import { getDatabase } from '../db/client'
import { daoMembershipSnapshots, payments, users, walletLinks } from '../db/schema'

export const DISCOUNTED_SHARE_PRICE_MINOR_UNITS = 250
export const MAX_MEMBER_PAYMENT_MINOR_UNITS = 20_000

export function currentPeriodKey(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}

export function subscriptionShares(amountMinorUnits: number): number {
  return amountMinorUnits / DISCOUNTED_SHARE_PRICE_MINOR_UNITS
}

export async function getAdminParticipationReport(now = new Date()) {
  const database = getDatabase()
  const periodKey = currentPeriodKey(now)
  const run = await getLatestSuccessfulMembershipRun()
  const [allUsers, activeWallets, confirmedPayments, snapshots] = await Promise.all([
    database.select().from(users),
    database.select().from(walletLinks).where(isNull(walletLinks.revokedAt)),
    database
      .select()
      .from(payments)
      .where(and(eq(payments.periodKey, periodKey), eq(payments.status, 'confirmed'))),
    run
      ? database
          .select()
          .from(daoMembershipSnapshots)
          .where(eq(daoMembershipSnapshots.runId, run.id))
      : Promise.resolve([]),
  ])

  const rows = allUsers.map((user) => {
    const userWallets = activeWallets.filter((wallet) => wallet.userId === user.id)
    const userSnapshots = snapshots.filter((snapshot) => snapshot.userId === user.id)
    const userPayments = confirmedPayments.filter(
      (payment) => payment.userId === user.id && payment.planKey.startsWith('member_share_'),
    )
    const amountMinorUnits = userPayments.reduce((sum, payment) => sum + payment.amountMinorUnits, 0)
    const eligibleSnapshot = userSnapshots.find((snapshot) => snapshot.eligible)
    const largestBalance = userSnapshots.reduce(
      (largest, snapshot) => BigInt(snapshot.shareBalanceRaw) > largest ? BigInt(snapshot.shareBalanceRaw) : largest,
      0n,
    )
    const isMember = Boolean(eligibleSnapshot)
    const paymentExceedsCap = amountMinorUnits > MAX_MEMBER_PAYMENT_MINOR_UNITS
    const shares = isMember && amountMinorUnits > 0 && !paymentExceedsCap
      ? subscriptionShares(amountMinorUnits)
      : 0
    const status = !userWallets.length
      ? 'No verified wallet'
      : !run || userSnapshots.length === 0
        ? 'Needs chain refresh'
        : !isMember
          ? 'Below 100 RG'
          : paymentExceedsCap
            ? 'Payment exceeds $200 cap'
            : amountMinorUnits === 0
            ? 'No confirmed payment'
            : 'Ready for review'

    return {
      amountMinorUnits,
      balance: formatUnits(largestBalance, run?.tokenDecimals ?? 18),
      displayName: user.displayName ?? user.email ?? user.portalUserId,
      isMember,
      portalUserId: user.portalUserId,
      shares,
      status,
      wallets: userWallets.map((wallet) => wallet.address),
    }
  })

  return {
    activePayments: new Set(confirmedPayments.map((payment) => payment.userId)).size,
    exceptions: rows.filter((row) => row.status !== 'Ready for review').length,
    periodKey,
    rows,
    run,
    totalShares: rows.reduce((sum, row) => sum + row.shares, 0),
  }
}
