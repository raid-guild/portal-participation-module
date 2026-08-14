import { AppShell } from '@/components/AppShell'
import { ParticipationDashboard } from '@/components/ParticipationDashboard'
import { getParticipantDashboardState } from '@/lib/dashboard/service'
import { getCurrentSession } from '@/lib/portal/session'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const isPrototype = process.env.NEXT_PUBLIC_APP_MODE === 'mock'
  const session = await getCurrentSession()
  if (!isPrototype && !session) redirect('/portal/auth-error?reason=login_required')
  const dashboard = session
    ? await getParticipantDashboardState(session.id, session.credentials)
    : null

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
    </AppShell>
  )
}
