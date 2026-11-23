import { NextResponse } from 'next/server'

import { hasValidRequestOrigin } from '@/lib/http/same-origin'
import { freezeIssuanceReview, IssuanceReviewError, listIssuanceReviews } from '@/lib/issuance/service'
import { getCurrentSession } from '@/lib/portal/session'

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin) return NextResponse.json({ error: 'App admin role required.' }, { status: 403 })
  const snapshots = await listIssuanceReviews()
  return NextResponse.json({ snapshots: snapshots.map((snapshot) => ({
    id: snapshot.id, periodKey: snapshot.periodKey, revision: snapshot.revision,
    payloadSha256: snapshot.payloadSha256, createdAt: snapshot.createdAt,
  })) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin) return NextResponse.json({ error: 'App admin role required.' }, { status: 403 })
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  try {
    const body = request.headers.get('content-type')?.includes('application/json')
      ? await request.json() as { periodKey?: unknown }
      : Object.fromEntries((await request.formData()).entries())
    if (typeof body.periodKey !== 'string') throw new IssuanceReviewError('periodKey is required.', 400)
    const snapshot = await freezeIssuanceReview(body.periodKey, session.id)
    if (request.headers.get('accept')?.includes('text/html')) return NextResponse.redirect(new URL(`/admin/issuance/${snapshot.id}`, request.url), 303)
    return NextResponse.json({ id: snapshot.id, revision: snapshot.revision, payloadSha256: snapshot.payloadSha256 }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to freeze issuance review.' }, {
      status: error instanceof IssuanceReviewError ? error.status : 500,
    })
  }
}
