import { NextResponse } from 'next/server'

import { getCurrentSession } from '@/lib/portal/session'

export async function GET() {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        credentials: session.credentials,
        displayName: session.displayName,
        isAppAdmin: session.isAppAdmin,
        portalProfileId: session.portalProfileId,
        portalUserId: session.portalUserId,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
