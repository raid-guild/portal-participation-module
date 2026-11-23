import { NextResponse } from 'next/server'

import { getPaymentHistory } from '@/lib/payments/history'
import { getCurrentSession } from '@/lib/portal/session'

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  return NextResponse.json({ items: await getPaymentHistory(session.id) }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
