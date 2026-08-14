import { NextResponse } from 'next/server'

import { appURL } from '@/lib/http/app-url'
import {
  PortalAuthConfigurationError,
  verifyPortalLaunchToken,
} from '@/lib/portal/launch-token'
import { consumePortalLaunch } from '@/lib/portal/session'
import { SESSION_COOKIE_NAME } from '@/lib/portal/session-token'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requestURL = new URL(request.url)
  const token = requestURL.searchParams.get('token')

  if (!token) return authError(requestURL, 'missing_token')

  try {
    const claims = await verifyPortalLaunchToken(token)
    const session = await consumePortalLaunch(claims)
    const response = NextResponse.redirect(appURL('/?auth=portal', requestURL), 303)

    response.cookies.set(SESSION_COOKIE_NAME, session.token, {
      expires: session.expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch (error: unknown) {
    if (error instanceof PortalAuthConfigurationError) {
      return NextResponse.json(
        { error: 'portal_auth_not_configured' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return authError(requestURL, isUniqueViolation(error) ? 'token_replayed' : 'invalid_token')
  }
}

function authError(requestURL: URL, reason: string) {
  const destination = appURL('/portal/auth-error', requestURL)
  destination.searchParams.set('reason', reason)
  return NextResponse.redirect(destination, 303)
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && error.code === '23505') return true
  return 'cause' in error && isUniqueViolation(error.cause)
}
