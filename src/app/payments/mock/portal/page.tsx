import { AppShell } from '@/components/AppShell'
import { MockBillingPortal } from '@/components/MockBillingPortal'
import { notFound } from 'next/navigation'

export default function MockBillingPortalPage() {
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'mock') notFound()
  return (
    <AppShell>
      <MockBillingPortal />
    </AppShell>
  )
}
