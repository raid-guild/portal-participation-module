import { NextResponse } from 'next/server'

import { authorizeServiceRequest } from '@/lib/entitlements/auth'
import { authorizationErrorResponse } from '@/lib/entitlements/http'
import { getEntitlementSnapshot } from '@/lib/entitlements/service'

type RouteContext = {
  params: Promise<{ portalUserId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const authorization = authorizeServiceRequest(request.headers)
  if (!authorization.ok) return authorizationErrorResponse(authorization)

  const { portalUserId } = await context.params
  const snapshot = await getEntitlementSnapshot(portalUserId)

  if (!snapshot) {
    return NextResponse.json(
      { error: 'subject_not_found', message: 'No entitlement subject was found.' },
      { status: 404 },
    )
  }

  return NextResponse.json(snapshot)
}
