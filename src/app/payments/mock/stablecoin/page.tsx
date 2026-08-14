import { AppShell } from '@/components/AppShell'
import { MockStablecoinCheckout } from '@/components/MockStablecoinCheckout'
import { notFound } from 'next/navigation'

type Args = {
  searchParams: Promise<{ amount?: string; member?: string }>
}

export default async function MockStablecoinPage({ searchParams }: Args) {
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'mock') notFound()
  const query = await searchParams
  const requestedAmount = Number(query.amount)
  const amount = Number.isFinite(requestedAmount)
    ? Math.min(200, Math.max(20, Math.round(requestedAmount / 20) * 20))
    : 20

  return (
    <AppShell>
      <MockStablecoinCheckout amount={amount} isMember={query.member === 'true'} />
    </AppShell>
  )
}
