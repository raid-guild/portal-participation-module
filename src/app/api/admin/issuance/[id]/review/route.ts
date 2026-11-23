import { NextResponse } from 'next/server'

import { hasValidRequestOrigin } from '@/lib/http/same-origin'
import { IssuanceReviewError, reviewIssuanceSnapshot } from '@/lib/issuance/service'
import { getCurrentSession } from '@/lib/portal/session'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin) return NextResponse.json({ error: 'App admin role required.' }, { status: 403 })
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  try {
    const { id } = await context.params
    const body = request.headers.get('content-type')?.includes('application/json')
      ? await request.json() as { decision?: unknown; note?: unknown }
      : Object.fromEntries((await request.formData()).entries())
    if (body.decision !== 'approved' && body.decision !== 'rejected') throw new IssuanceReviewError('Decision must be approved or rejected.', 400)
    if (typeof body.note !== 'string' || body.note.trim().length < 10 || body.note.length > 1000) throw new IssuanceReviewError('A review note of 10–1000 characters is required.', 400)
    const decision = await reviewIssuanceSnapshot(id, session.id, body.decision, body.note)
    if (request.headers.get('accept')?.includes('text/html')) return NextResponse.redirect(new URL(`/admin/issuance/${id}?review=recorded`, request.url), 303)
    return NextResponse.json({ id: decision.id, decision: decision.decision, payloadSha256: decision.payloadSha256 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to review issuance snapshot.' }, {
      status: error instanceof IssuanceReviewError ? error.status : 500,
    })
  }
}
