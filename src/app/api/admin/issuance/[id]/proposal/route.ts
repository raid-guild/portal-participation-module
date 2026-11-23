import { NextResponse } from 'next/server'

import { buildProposalArtifact, GovernancePreparationError } from '@/lib/governance/service'
import { hasValidRequestOrigin } from '@/lib/http/same-origin'
import { getCurrentSession } from '@/lib/portal/session'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin || !hasValidRequestOrigin(request)) return NextResponse.json({ error: 'App admin and same-origin request required.' }, { status: 403 })
  try {
    const { id } = await context.params
    const body = request.headers.get('content-type')?.includes('application/json')
      ? await request.json() as { submitterAddress?: unknown }
      : Object.fromEntries((await request.formData()).entries())
    if (typeof body.submitterAddress !== 'string') throw new GovernancePreparationError('Connected submitter address required.', 400)
    const artifact = await buildProposalArtifact(id, session.id, body.submitterAddress)
    if (request.headers.get('accept')?.includes('text/html')) return NextResponse.redirect(new URL(`/admin/proposals/${artifact.id}`, request.url), 303)
    return NextResponse.json({ id: artifact.id, artifactSha256: artifact.artifactSha256, url: `/admin/proposals/${artifact.id}` }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to simulate proposal.' }, { status: error instanceof GovernancePreparationError ? error.status : 500 })
  }
}
