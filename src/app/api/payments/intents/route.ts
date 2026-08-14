import { NextResponse } from 'next/server'

import { hasValidRequestOrigin } from '@/lib/http/same-origin'
import { createLivePaymentIntent, PaymentValidationError } from '@/lib/payments/live-stablecoin'
import { getCurrentSession } from '@/lib/portal/session'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  let body: { planKey?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Valid JSON is required.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await createLivePaymentIntent(session.id, body.planKey), {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const status = error instanceof PaymentValidationError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Unable to create payment intent.'
    return NextResponse.json({ error: message }, { status })
  }
}
