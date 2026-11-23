import { NextResponse } from 'next/server'

import { getProposalArtifact, GovernancePreparationError } from '@/lib/governance/service'
import { getCurrentSession } from '@/lib/portal/session'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin) return NextResponse.json({ error: 'App admin required.' }, { status: 403 })
  try {
    const state = await getProposalArtifact((await context.params).id)
    return NextResponse.json({ artifact: state.record, decision: state.decision, ready: state.ready, latest: state.latest, expired: state.expired, stale: state.review.stale }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load proposal artifact.' }, { status: error instanceof GovernancePreparationError ? error.status : 500 })
  }
}
