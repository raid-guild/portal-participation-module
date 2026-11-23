import { NextResponse } from 'next/server'

import { decideProposalArtifact, GovernancePreparationError } from '@/lib/governance/service'
import { hasValidRequestOrigin } from '@/lib/http/same-origin'
import { getCurrentSession } from '@/lib/portal/session'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin || !hasValidRequestOrigin(request)) return NextResponse.json({ error: 'App admin and same-origin request required.' }, { status: 403 })
  try {
    const { id } = await context.params
    const body = request.headers.get('content-type')?.includes('application/json')
      ? await request.json() as { decision?: unknown; note?: unknown }
      : Object.fromEntries((await request.formData()).entries())
    if (body.decision !== 'approved' && body.decision !== 'rejected') throw new GovernancePreparationError('Decision must be approved or rejected.', 400)
    if (typeof body.note !== 'string' || body.note.trim().length < 10 || body.note.length > 1000) throw new GovernancePreparationError('A 10–1000 character review note is required.', 400)
    const decision = await decideProposalArtifact(id, session.id, body.decision, body.note)
    if (request.headers.get('accept')?.includes('text/html')) return NextResponse.redirect(new URL(`/admin/proposals/${id}?review=recorded`, request.url), 303)
    return NextResponse.json({ id: decision.id, decision: decision.decision, artifactSha256: decision.artifactSha256 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to review proposal.' }, { status: error instanceof GovernancePreparationError ? error.status : 500 })
  }
}
