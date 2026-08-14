import { NextResponse } from 'next/server'

import { createOpenApiDocument } from '@/lib/entitlements/openapi'

export function GET() {
  return NextResponse.json(createOpenApiDocument())
}
