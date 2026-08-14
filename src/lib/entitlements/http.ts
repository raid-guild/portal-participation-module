import { NextResponse } from 'next/server'

import type { ServiceAuthorization } from '@/lib/entitlements/auth'

export function authorizationErrorResponse(
  authorization: Exclude<ServiceAuthorization, { ok: true }>,
) {
  if (authorization.reason === 'not_configured') {
    return NextResponse.json(
      {
        error: 'service_key_not_configured',
        message: 'Entitlement service access is disabled until a service key is configured.',
      },
      { status: 503 },
    )
  }

  return NextResponse.json(
    { error: 'unauthorized', message: 'A valid bearer service key is required.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
  )
}
