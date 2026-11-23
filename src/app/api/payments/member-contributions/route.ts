import { NextResponse } from 'next/server'

import { hasValidRequestOrigin } from '@/lib/http/same-origin'
import { beginTestMemberContribution, getTestMemberContributions, MemberContributionError } from '@/lib/payments/member-contribution-service'
import { getCurrentSession } from '@/lib/portal/session'

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  try { return NextResponse.json({ items: await getTestMemberContributions(session.id) }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unavailable.' }, { status: error instanceof MemberContributionError ? error.status : 500 }) }
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  let body: { amountUSD?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Valid JSON required.' }, { status: 400 }) }
  try {
    const checkout = await beginTestMemberContribution(session.id, body.amountUSD)
    return NextResponse.json(checkout, { status: checkout.status === 'creating' ? 202 : 201, headers: { 'Cache-Control': 'no-store' } })
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Checkout unavailable.' }, { status: error instanceof MemberContributionError ? error.status : 500 }) }
}
