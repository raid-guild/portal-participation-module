import { NextResponse } from 'next/server'

import { authorizeServiceRequest } from '@/lib/entitlements/auth'
import { authorizationErrorResponse } from '@/lib/entitlements/http'
import {
  getEntitlementSnapshot,
  isEntitlementTarget,
  planEntitlementReconciliation,
} from '@/lib/entitlements/service'

type ReconciliationRequest = {
  mode?: 'apply' | 'dry_run'
  portalUserId?: unknown
  targets?: unknown
}

export async function POST(request: Request) {
  const authorization = authorizeServiceRequest(request.headers)
  if (!authorization.ok) return authorizationErrorResponse(authorization)

  let body: ReconciliationRequest
  try {
    body = (await request.json()) as ReconciliationRequest
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'The request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const mode = body.mode ?? 'dry_run'
  if (
    typeof body.portalUserId !== 'string' ||
    !Array.isArray(body.targets) ||
    body.targets.length === 0 ||
    !body.targets.every(isEntitlementTarget) ||
    !['apply', 'dry_run'].includes(mode)
  ) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: 'portalUserId, one or more valid targets, and a valid mode are required.',
      },
      { status: 400 },
    )
  }

  const snapshot = await getEntitlementSnapshot(body.portalUserId)
  if (!snapshot) {
    return NextResponse.json(
      { error: 'subject_not_found', message: 'No entitlement subject was found.' },
      { status: 404 },
    )
  }

  const actions = planEntitlementReconciliation(snapshot, [...new Set(body.targets)])

  if (mode === 'apply') {
    return NextResponse.json(
      {
        actions,
        error: 'connector_not_configured',
        message: 'Apply mode is disabled until Portal or Discord connectors are configured.',
      },
      { status: 501 },
    )
  }

  return NextResponse.json({ actions, mode, snapshot })
}
