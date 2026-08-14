import { and, eq } from 'drizzle-orm'

import { currentPeriodKey } from '../admin/report'
import { getLatestSuccessfulMembershipRun } from '../dao/membership'
import { getDatabase } from '../db/client'
import { daoMembershipSnapshots, payments } from '../db/schema'
import type { BillingStatus, ParticipationCredential } from '../domain/participation'

export async function getParticipantDashboardState(
  userId: string,
  portalCredentials: ParticipationCredential[],
) {
  const database = getDatabase()
  const run = await getLatestSuccessfulMembershipRun()
  const [snapshots, confirmedPayments] = await Promise.all([
    run
      ? database
          .select()
          .from(daoMembershipSnapshots)
          .where(
            and(
              eq(daoMembershipSnapshots.runId, run.id),
              eq(daoMembershipSnapshots.userId, userId),
            ),
          )
      : Promise.resolve([]),
    database
      .select({ amountMinorUnits: payments.amountMinorUnits, planKey: payments.planKey })
      .from(payments)
      .where(
        and(
          eq(payments.userId, userId),
          eq(payments.periodKey, currentPeriodKey()),
          eq(payments.status, 'confirmed'),
        ),
      ),
  ])
  const canonicalMember = snapshots.some((snapshot) => snapshot.eligible)
  const credentials: ParticipationCredential[] = portalCredentials.filter(
    (credential) => credential !== 'raidguild_member',
  )
  if (canonicalMember) credentials.unshift('raidguild_member')
  const eligiblePayments = canonicalMember
    ? confirmedPayments.filter((item) => item.planKey.startsWith('member_share_'))
    : confirmedPayments
  const amountMinorUnits = eligiblePayments.reduce((sum, item) => sum + item.amountMinorUnits, 0)
  const billingStatus: BillingStatus = amountMinorUnits > 0 ? 'active' : 'not_started'

  return {
    amountUSD: Math.min(amountMinorUnits / 100, 200),
    billingStatus,
    canonicalMember,
    credentials,
    hasMembershipSnapshot: Boolean(run && snapshots.length),
  }
}
