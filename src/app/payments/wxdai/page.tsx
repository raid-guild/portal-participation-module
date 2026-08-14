import { redirect } from 'next/navigation'

import { AppShell } from '@/components/AppShell'
import { StablecoinCheckout } from '@/components/StablecoinCheckout'
import { getParticipantDashboardState } from '@/lib/dashboard/service'
import { resolveParticipationClass } from '@/lib/domain/participation'
import { getCurrentSession } from '@/lib/portal/session'

export default async function WxdaiPaymentPage({ searchParams }: { searchParams: Promise<{ amount?: string }> }) {
  const session = await getCurrentSession()
  if (!session) redirect('/portal/auth-error?reason=login_required')
  const state = await getParticipantDashboardState(session.id, session.credentials)
  const participationClass = resolveParticipationClass(state.credentials)
  const isMember = participationClass === 'member'
  const requested = Number((await searchParams).amount)
  const amount = isMember && Number.isFinite(requested)
    ? Math.min(200, Math.max(20, Math.round(requested / 20) * 20))
    : 20
  return <AppShell><StablecoinCheckout initialAmount={amount} participationClass={participationClass} /></AppShell>
}
