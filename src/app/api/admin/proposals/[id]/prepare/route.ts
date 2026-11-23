import { NextResponse } from 'next/server'

import { GovernancePreparationError, prepareProposalTransaction } from '@/lib/governance/service'
import { hasValidRequestOrigin } from '@/lib/http/same-origin'
import { getCurrentSession } from '@/lib/portal/session'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin || !hasValidRequestOrigin(request)) return NextResponse.json({ error: 'App admin and same-origin request required.' }, { status: 403 })
  try {
    const transaction = await prepareProposalTransaction((await context.params).id, session.id)
    return NextResponse.json({ transaction, submissionEnabled: false })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to prepare proposal transaction.' }, { status: error instanceof GovernancePreparationError ? error.status : 500 })
  }
}
