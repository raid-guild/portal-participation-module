import { NextResponse } from 'next/server'

import { getIssuanceReview } from '@/lib/issuance/service'
import { getCurrentSession } from '@/lib/portal/session'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin) return NextResponse.json({ error: 'App admin role required.' }, { status: 403 })
  const { id } = await context.params
  const { snapshot, decisions, stale, latest } = await getIssuanceReview(id)
  return NextResponse.json({
    payloadSha256: snapshot.payloadSha256, payload: snapshot.payload,
    periodKey: snapshot.periodKey, revision: snapshot.revision,
    stale, latest,
    decisions: decisions.map((decision) => ({ decision: decision.decision, reviewerUserId: decision.reviewerUserId, payloadSha256: decision.payloadSha256, createdAt: decision.createdAt })),
  }, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="issuance-review-${snapshot.periodKey}-r${snapshot.revision}.json"`,
    },
  })
}
