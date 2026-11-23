import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { acceptTestMemberContributionEvent, MemberContributionError } from '@/lib/payments/member-contribution-service'

function authorized(headers: Headers): boolean {
  const configured = process.env.COMMERCE_BILLING_WRITE_KEY
  const supplied = headers.get('authorization')?.replace(/^Bearer /, '')
  if (!configured || !supplied) return false
  const a = Buffer.from(configured), b = Buffer.from(supplied)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!process.env.COMMERCE_BILLING_WRITE_KEY) return NextResponse.json({ error: 'Service not configured.' }, { status: 503 })
  if (!authorized(request.headers)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 16_384) return NextResponse.json({ error: 'Event too large.' }, { status: 413 })
  let input: unknown
  try { input = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }
  try { return NextResponse.json(await acceptTestMemberContributionEvent(input), { headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Billing event failed.' }, { status: error instanceof MemberContributionError ? error.status : 500 }) }
}
