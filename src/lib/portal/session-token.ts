import { createHmac, randomBytes } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'rg_participation_session'
export const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET?.trim()
  if (!value) throw new Error('SESSION_SECRET is not configured.')
  return value
}

export function hashSessionToken(token: string): string {
  return createHmac('sha256', sessionSecret()).update(token).digest('hex')
}

export function sessionTTLSeconds(): number {
  const configured = Number(process.env.SESSION_TTL_SECONDS ?? DEFAULT_SESSION_TTL_SECONDS)
  if (!Number.isInteger(configured) || configured < 15 * 60 || configured > 24 * 60 * 60) {
    return DEFAULT_SESSION_TTL_SECONDS
  }
  return configured
}

export function createSessionToken(now = new Date()) {
  const token = randomBytes(32).toString('base64url')
  const ttlSeconds = sessionTTLSeconds()

  return {
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    token,
    tokenHash: hashSessionToken(token),
    ttlSeconds,
  }
}
