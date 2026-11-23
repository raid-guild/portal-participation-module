import { NextResponse } from 'next/server'

import { getIssuanceReview, IssuanceReviewError } from '@/lib/issuance/service'
import { getCurrentSession } from '@/lib/portal/session'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin) return NextResponse.json({ error: 'App admin role required.' }, { status: 403 })
  try {
    const { id } = await context.params
    const review = await getIssuanceReview(id)
    return NextResponse.json(review, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load review.' }, {
      status: error instanceof IssuanceReviewError ? error.status : 500,
    })
  }
}
