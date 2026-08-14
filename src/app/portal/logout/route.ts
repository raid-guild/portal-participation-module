import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { appURL } from '@/lib/http/app-url'
import { revokeSession } from '@/lib/portal/session'
import { SESSION_COOKIE_NAME } from '@/lib/portal/session-token'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (token) await revokeSession(token)

  const response = NextResponse.redirect(appURL('/', new URL(request.url)), 303)
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
