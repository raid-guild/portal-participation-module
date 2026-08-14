import { NextResponse } from 'next/server'

import { hasValidRequestOrigin } from '@/lib/http/same-origin'
import { confirmLivePayment, PaymentValidationError } from '@/lib/payments/live-stablecoin'
import { getCurrentSession } from '@/lib/portal/session'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  let body: { intentId?: unknown; transactionHash?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Valid JSON is required.' }, { status: 400 })
  }
  try {
    const result = await confirmLivePayment(session.id, body.intentId, body.transactionHash)
    return NextResponse.json(result, {
      status: result.status === 'confirmed' ? 200 : 202,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const status = error instanceof PaymentValidationError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Unable to confirm payment.'
    return NextResponse.json({ error: message }, { status })
  }
}
