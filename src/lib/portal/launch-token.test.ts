import { SignJWT } from 'jose'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  credentialsFromLaunch,
  type PortalLaunchCredential,
  verifyPortalLaunchToken,
} from './launch-token'
import { hashSessionToken, sessionTTLSeconds } from './session-token'

const SECRET = 'test-only-secret-that-is-long-enough-for-hs256'

describe('Portal launch authentication', () => {
  beforeEach(() => {
    process.env.PORTAL_MODULE_LAUNCH_SECRET = SECRET
    process.env.PORTAL_LAUNCH_ISSUER = 'https://portal.raidguild.org'
    process.env.PORTAL_LAUNCH_AUDIENCE = 'participation'
    process.env.PORTAL_MODULE_SLUG = 'participation'
    process.env.SESSION_SECRET = 'test-only-session-secret'
  })

  afterEach(() => {
    delete process.env.PORTAL_MODULE_LAUNCH_SECRET
    delete process.env.PORTAL_LAUNCH_ISSUER
    delete process.env.PORTAL_LAUNCH_AUDIENCE
    delete process.env.PORTAL_MODULE_SLUG
    delete process.env.SESSION_SECRET
    delete process.env.SESSION_TTL_SECONDS
  })

  it('verifies the complete Portal launch boundary', async () => {
    const token = await launchToken()
    const claims = await verifyPortalLaunchToken(token)

    expect(claims.userID).toBe(42)
    expect(claims.moduleSlug).toBe('participation')
    expect(claims.jti).toBe('launch-1')
    expect(claims.credentials).toEqual(['cohort_grad', 'member'])
    expect(claims.wallets).toEqual([
      {
        address: '0x1111111111111111111111111111111111111111',
        chainId: 100,
        verifiedAt: '2026-08-14T12:00:00.000Z',
      },
    ])
  })

  it('rejects a token issued for another module', async () => {
    const token = await launchToken('another-module')
    await expect(verifyPortalLaunchToken(token)).rejects.toThrow()
  })

  it('rejects a token whose subject does not match its Portal user ID', async () => {
    const token = await launchToken('participation', 'user:99')
    await expect(verifyPortalLaunchToken(token)).rejects.toThrow()
  })

  it('maps only trusted member roles while preserving module-owned cohort credentials', () => {
    const claims = {
      credentials: undefined,
      exp: 1,
      iat: 1,
      iss: 'https://portal.raidguild.org',
      jti: 'launch-1',
      moduleSlug: 'participation',
      roles: ['member'],
      scopes: ['profile:read'],
      typ: 'portal_module_launch' as const,
      userID: 42,
    }

    expect(credentialsFromLaunch(claims, ['cohort_grad'])).toEqual([
      'raidguild_member',
      'cohort_grad',
    ])
    expect(credentialsFromLaunch({ ...claims, roles: [] }, ['raidguild_member', 'cohort_grad']))
      .toEqual(['cohort_grad'])
  })

  it('normalizes Portal credentials while preserving module-owned participation state', () => {
    const claims = {
      credentials: ['cohort_grad', 'member'] as PortalLaunchCredential[],
      exp: 1,
      iat: 1,
      iss: 'https://portal.raidguild.org',
      jti: 'launch-1',
      moduleSlug: 'participation',
      scopes: ['profile:read'],
      sub: 'user:42',
      typ: 'portal_module_launch' as const,
      userID: 42,
    }

    expect(credentialsFromLaunch(claims, ['cohort_participant'], true)).toEqual([
      'raidguild_member',
      'cohort_participant',
      'cohort_grad',
    ])
  })

  it('rejects wallet claims outside Gnosis Chain', async () => {
    const token = await launchToken('participation', 'user:42', 1)
    await expect(verifyPortalLaunchToken(token)).rejects.toThrow('wallet claims')
  })

  it('hashes opaque sessions and bounds configured session lifetime', () => {
    expect(hashSessionToken('opaque-token')).toHaveLength(64)
    process.env.SESSION_TTL_SECONDS = '60'
    expect(sessionTTLSeconds()).toBe(8 * 60 * 60)
  })
})

async function launchToken(audience = 'participation', subject = 'user:42', chainId = 100) {
  return new SignJWT({
    credentials: ['cohort_grad', 'member'],
    moduleSlug: 'participation',
    roles: ['member'],
    scopes: ['profile:read'],
    typ: 'portal_module_launch',
    userID: 42,
    wallets: [
      {
        address: '0x1111111111111111111111111111111111111111',
        chainId,
        verifiedAt: '2026-08-14T12:00:00.000Z',
      },
    ],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('https://portal.raidguild.org')
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('2m')
    .setJti('launch-1')
    .sign(new TextEncoder().encode(SECRET))
}
