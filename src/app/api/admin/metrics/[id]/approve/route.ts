import { NextResponse } from 'next/server'

import { hasValidRequestOrigin } from '@/lib/http/same-origin'
import { approveParticipationMetricImport, MetricApprovalError } from '@/lib/metrics/approval'
import { getCurrentSession } from '@/lib/portal/session'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin) return NextResponse.json({ error: 'App admin role required.' }, { status: 403 })
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  try {
    const { id } = await context.params
    const approval = await approveParticipationMetricImport(id, session.id)
    if (request.headers.get('accept')?.includes('text/html')) return NextResponse.redirect(new URL('/admin?metrics=approved', request.url), 303)
    return NextResponse.json({ id: approval.id, importId: approval.importId, contentSha256: approval.contentSha256 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to approve metrics.' }, {
      status: error instanceof MetricApprovalError ? error.status : 500,
    })
  }
}
