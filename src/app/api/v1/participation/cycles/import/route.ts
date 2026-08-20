import { NextResponse } from 'next/server'

import { authorizeMetricsWriteRequest } from '@/lib/entitlements/auth'
import { authorizationErrorResponse } from '@/lib/entitlements/http'
import {
  importParticipationMetrics,
  validateParticipationMetricImport,
} from '@/lib/metrics/import'

export async function POST(request: Request) {
  const authorization = authorizeMetricsWriteRequest(request.headers)
  if (!authorization.ok) return authorizationErrorResponse(authorization)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'The request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const validation = validateParticipationMetricImport(body)
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'invalid_request', message: validation.message },
      { status: 400 },
    )
  }

  const result = await importParticipationMetrics(validation.value)
  if (result.conflict) {
    return NextResponse.json(
      {
        error: 'source_run_conflict',
        message: 'This Prism run ID was already imported with a different artifact hash.',
      },
      { status: 409 },
    )
  }

  return NextResponse.json(
    {
      idempotent: result.idempotent,
      importId: result.import.id,
      matchedCount: result.import.matchedCount,
      memberCount: result.import.memberCount,
      snapshotKey: result.import.snapshotKey,
      status: result.import.status,
      unmatchedCount: result.import.unmatchedCount,
    },
    { status: result.idempotent ? 200 : 201 },
  )
}
