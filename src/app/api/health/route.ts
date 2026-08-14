import { NextResponse } from 'next/server'

import { checkDatabase } from '@/lib/db/client'

export const runtime = 'nodejs'

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      database: 'not_configured',
      service: 'raidguild-participation-module',
      status: 'ok',
    })
  }

  try {
    await checkDatabase()
    return NextResponse.json({
      database: 'connected',
      service: 'raidguild-participation-module',
      status: 'ok',
    })
  } catch {
    return NextResponse.json(
      {
        database: 'unavailable',
        service: 'raidguild-participation-module',
        status: 'error',
      },
      { status: 503 },
    )
  }
}
