import { NextResponse } from 'next/server'

import { refreshDaoMembership } from '@/lib/dao/membership'
import { appURL } from '@/lib/http/app-url'
import { getCurrentSession } from '@/lib/portal/session'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!session.isAppAdmin) return NextResponse.json({ error: 'App admin role required.' }, { status: 403 })

  const origin = request.headers.get('origin')
  if (origin && origin !== appURL('/', new URL(request.url)).origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }

  try {
    const result = await refreshDaoMembership(`portal:${session.portalUserId}`)
    if (request.headers.get('accept')?.includes('text/html')) {
      return NextResponse.redirect(new URL('/admin?refresh=succeeded', request.url), 303)
    }
    return NextResponse.json({
      ...result,
      blockNumber: result.blockNumber.toString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Membership refresh failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
