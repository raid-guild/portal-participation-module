import { jwtVerify, type JWTPayload } from 'jose'
import { getAddress, isAddress } from 'viem'

import {
  type ParticipationCredential,
} from '../domain/participation'

export const PORTAL_LAUNCH_CREDENTIALS = ['cohort_grad', 'member'] as const
export type PortalLaunchCredential = (typeof PORTAL_LAUNCH_CREDENTIALS)[number]

export type PortalLaunchWallet = {
  address: `0x${string}`
  chainId: 100
  verifiedAt: string
}

export type PortalLaunchClaims = JWTPayload & {
  credentials?: PortalLaunchCredential[]
  email?: string
  handle?: string
  moduleSlug: string
  name?: string
  picture?: string
  profileID?: number | string
  roles?: string[]
  scopes: string[]
  typ: 'portal_module_launch'
  userID: number | string
  wallets?: PortalLaunchWallet[]
}

export class PortalAuthConfigurationError extends Error {}

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new PortalAuthConfigurationError(`${name} is not configured.`)
  return value
}

export async function verifyPortalLaunchToken(token: string): Promise<PortalLaunchClaims> {
  if (!token || token.length > 8192) throw new Error('Portal launch token is invalid.')

  const secret = requiredSetting('PORTAL_MODULE_LAUNCH_SECRET')
  const issuer = requiredSetting('PORTAL_LAUNCH_ISSUER').replace(/\/+$/, '')
  const audience = requiredSetting('PORTAL_LAUNCH_AUDIENCE')
  const moduleSlug = requiredSetting('PORTAL_MODULE_SLUG')
  const now = Math.floor(Date.now() / 1000)

  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'],
    audience,
    issuer,
  })

  if (
    payload.typ !== 'portal_module_launch' ||
    payload.moduleSlug !== moduleSlug ||
    typeof payload.jti !== 'string' ||
    !payload.jti ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > 600 ||
    payload.iat > now + 30 ||
    (typeof payload.userID !== 'string' && typeof payload.userID !== 'number') ||
    payload.sub !== `user:${payload.userID}` ||
    !Array.isArray(payload.scopes) ||
    !payload.scopes.every((scope) => typeof scope === 'string') ||
    !payload.scopes.includes('profile:read')
  ) {
    throw new Error('Portal launch claims are invalid.')
  }

  if (payload.credentials !== undefined) {
    if (
      !Array.isArray(payload.credentials) ||
      !payload.credentials.every((credential) =>
        PORTAL_LAUNCH_CREDENTIALS.includes(credential as PortalLaunchCredential),
      )
    ) {
      throw new Error('Portal participation credentials are invalid.')
    }
  }

  const wallets = validateWallets(payload.wallets, now)

  if (
    payload.roles !== undefined &&
    (!Array.isArray(payload.roles) || !payload.roles.every((role) => typeof role === 'string'))
  ) {
    throw new Error('Portal roles are invalid.')
  }

  if (
    (payload.email !== undefined && typeof payload.email !== 'string') ||
    (payload.name !== undefined && typeof payload.name !== 'string') ||
    (payload.profileID !== undefined &&
      typeof payload.profileID !== 'string' &&
      typeof payload.profileID !== 'number')
  ) {
    throw new Error('Portal identity claims are invalid.')
  }

  return { ...payload, wallets } as PortalLaunchClaims
}

export function credentialsFromLaunch(
  claims: PortalLaunchClaims,
  existing: ParticipationCredential[] = [],
  claimsAreAuthoritative = claims.credentials !== undefined,
): ParticipationCredential[] {
  if (claimsAreAuthoritative) {
    const credentials: ParticipationCredential[] = existing.filter(
      (credential) => credential === 'cohort_participant',
    )
    if (claims.credentials?.includes('cohort_grad')) credentials.push('cohort_grad')
    if (claims.credentials?.includes('member')) credentials.unshift('raidguild_member')
    return [...new Set(credentials)]
  }

  const credentials: ParticipationCredential[] = existing.filter(
    (credential) => credential !== 'raidguild_member',
  )
  if (claims.roles?.includes('member')) credentials.unshift('raidguild_member')
  return [...new Set(credentials)]
}

function validateWallets(value: unknown, now: number): PortalLaunchWallet[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 5) {
    throw new Error('Portal wallet claims are invalid.')
  }

  const seen = new Set<string>()
  return value.map((candidate) => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !('address' in candidate) ||
      typeof candidate.address !== 'string' ||
      !isAddress(candidate.address) ||
      !('chainId' in candidate) ||
      candidate.chainId !== 100 ||
      !('verifiedAt' in candidate) ||
      typeof candidate.verifiedAt !== 'string'
    ) {
      throw new Error('Portal wallet claims are invalid.')
    }

    const address = getAddress(candidate.address)
    const verifiedAt = new Date(candidate.verifiedAt)
    if (!Number.isFinite(verifiedAt.getTime()) || verifiedAt.getTime() > (now + 300) * 1000) {
      throw new Error('Portal wallet verification time is invalid.')
    }

    const key = `100:${address.toLowerCase()}`
    if (seen.has(key)) throw new Error('Portal wallet claims contain a duplicate.')
    seen.add(key)

    return { address, chainId: 100, verifiedAt: verifiedAt.toISOString() }
  })
}
