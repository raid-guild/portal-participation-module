import { AppShell } from '@/components/AppShell'
import { ParticipationDashboard } from '@/components/ParticipationDashboard'
import { PaymentHistory } from '@/components/PaymentHistory'
import { ApprovedParticipationMetrics } from '@/components/ApprovedParticipationMetrics'
import { getParticipantDashboardState } from '@/lib/dashboard/service'
import { getCurrentSession } from '@/lib/portal/session'
import { getPaymentHistory } from '@/lib/payments/history'
import { getApprovedParticipationMetrics } from '@/lib/metrics/approval'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const isPrototype = process.env.NEXT_PUBLIC_APP_MODE === 'mock'
  const session = await getCurrentSession()
  if (!isPrototype && !session) redirect('/portal/auth-error?reason=login_required')
  const dashboard = session
    ? await getParticipantDashboardState(session.id, session.credentials)
    : null
  const paymentHistory = session ? await getPaymentHistory(session.id) : []
  const approvedMetrics = session ? await getApprovedParticipationMetrics(session.id) : null

  return (
    <AppShell>
      <ParticipationDashboard
        initial={session && dashboard ? {
          amountUSD: dashboard.amountUSD,
          billingStatus: dashboard.billingStatus,
          credentials: dashboard.credentials,
          displayName: session.displayName ?? session.email ?? 'Raider',
          handle: session.portalUserId,
          hasMembershipSnapshot: dashboard.hasMembershipSnapshot,
        } : undefined}
        showPrototypeControls={isPrototype}
      />
      {session ? <PaymentHistory items={paymentHistory} /> : null}
      {session ? <ApprovedParticipationMetrics metrics={approvedMetrics} /> : null}
    </AppShell>
  )
}
