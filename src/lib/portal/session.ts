import { and, eq, gt, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { getDatabase } from '@/lib/db/client'
import {
  appRoleAssignments,
  auditEvents,
  portalLaunches,
  sessions,
  users,
  walletLinks,
} from '@/lib/db/schema'
import type { ParticipationCredential } from '@/lib/domain/participation'

import { credentialsFromLaunch, type PortalLaunchClaims } from './launch-token'
import { createSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from './session-token'

export type AuthenticatedUser = {
  credentials: ParticipationCredential[]
  displayName: string | null
  email: string | null
  id: string
  isAppAdmin: boolean
  portalProfileId: string | null
  portalUserId: string
  sessionExpiresAt: Date
}

export async function consumePortalLaunch(claims: PortalLaunchClaims) {
  const database = getDatabase()
  const material = createSessionToken()
  const portalUserId = String(claims.userID)
  const portalProfileId = claims.profileID === undefined ? null : String(claims.profileID)

  const user = await database.transaction(async (transaction) => {
    await transaction.insert(portalLaunches).values({
      expiresAt: new Date(claims.exp! * 1000),
      jwtId: claims.jti!,
      portalUserId,
    })

    const [existing] = await transaction
      .select({ credentials: users.credentials })
      .from(users)
      .where(eq(users.portalUserId, portalUserId))
      .limit(1)

    const credentials = credentialsFromLaunch(
      claims,
      existing?.credentials ?? [],
      claims.credentials !== undefined || process.env.PORTAL_CREDENTIAL_CLAIMS_ENABLED === 'true',
    )
    const now = new Date()
    const [upsertedUser] = await transaction
      .insert(users)
      .values({
        credentialSyncedAt: now,
        credentials,
        displayName: claims.name ?? null,
        email: claims.email ?? null,
        portalProfileId,
        portalUserId,
      })
      .onConflictDoUpdate({
        set: {
          credentialSyncedAt: now,
          credentials,
          displayName: claims.name ?? null,
          email: claims.email ?? null,
          portalProfileId,
          updatedAt: now,
        },
        target: users.portalUserId,
      })
      .returning({ id: users.id })

    const shouldSyncWallets =
      claims.wallets !== undefined || process.env.PORTAL_WALLET_CLAIMS_ENABLED === 'true'
    if (shouldSyncWallets) {
      await syncPortalWallets(transaction, upsertedUser.id, claims.wallets ?? [], now)
    }

    await transaction.insert(sessions).values({
      expiresAt: material.expiresAt,
      tokenHash: material.tokenHash,
      userId: upsertedUser.id,
    })

    await transaction.insert(auditEvents).values({
      action: 'portal_session.created',
      actorId: portalUserId,
      actorType: 'portal_user',
      details: {
        credentialCount: credentials.length,
        walletCount: claims.wallets?.length ?? 0,
      },
      entityId: upsertedUser.id,
      entityType: 'user',
    })

    return upsertedUser
  })

  return { ...material, userId: user.id }
}

type DatabaseTransaction = Parameters<Parameters<ReturnType<typeof getDatabase>['transaction']>[0]>[0]

async function syncPortalWallets(
  transaction: DatabaseTransaction,
  userId: string,
  claimedWallets: NonNullable<PortalLaunchClaims['wallets']>,
  now: Date,
) {
  const existingForUser = await transaction
    .select()
    .from(walletLinks)
    .where(eq(walletLinks.userId, userId))
  const claimedKeys = new Set(
    claimedWallets.map((wallet) => `${wallet.chainId}:${wallet.address.toLowerCase()}`),
  )

  for (const existing of existingForUser) {
    const key = `${existing.chainId}:${existing.address.toLowerCase()}`
    if (
      existing.verificationSource === 'portal_launch' &&
      !existing.revokedAt &&
      !claimedKeys.has(key)
    ) {
      await transaction
        .update(walletLinks)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(walletLinks.id, existing.id))
    }
  }

  for (const wallet of claimedWallets) {
    const [existing] = await transaction
      .select()
      .from(walletLinks)
      .where(
        and(
          eq(walletLinks.chainId, wallet.chainId),
          eq(walletLinks.address, wallet.address),
        ),
      )
      .limit(1)

    if (existing && existing.userId !== userId) {
      throw new Error('Verified wallet is already linked to another participation user.')
    }

    if (existing) {
      await transaction
        .update(walletLinks)
        .set({
          revokedAt: null,
          updatedAt: now,
          verificationSource: 'portal_launch',
          verifiedAt: new Date(wallet.verifiedAt),
        })
        .where(eq(walletLinks.id, existing.id))
    } else {
      await transaction.insert(walletLinks).values({
        address: wallet.address,
        chainId: wallet.chainId,
        userId,
        verificationSource: 'portal_launch',
        verifiedAt: new Date(wallet.verifiedAt),
      })
    }
  }
}

export async function getCurrentSession(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token || !process.env.SESSION_SECRET || !process.env.DATABASE_URL) return null

  const database = getDatabase()
  const [record] = await database
    .select({
      credentials: users.credentials,
      displayName: users.displayName,
      email: users.email,
      expiresAt: sessions.expiresAt,
      id: users.id,
      portalProfileId: users.portalProfileId,
      portalUserId: users.portalUserId,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1)

  if (!record) return null

  const [adminRole] = await database
    .select({ id: appRoleAssignments.id })
    .from(appRoleAssignments)
    .where(
      and(
        eq(appRoleAssignments.userId, record.id),
        eq(appRoleAssignments.role, 'participation_app_admin'),
      ),
    )
    .limit(1)

  return {
    credentials: record.credentials,
    displayName: record.displayName,
    email: record.email,
    id: record.id,
    isAppAdmin: Boolean(adminRole),
    portalProfileId: record.portalProfileId,
    portalUserId: record.portalUserId,
    sessionExpiresAt: record.expiresAt,
  }
}

export async function revokeSession(token: string): Promise<void> {
  if (!process.env.SESSION_SECRET || !process.env.DATABASE_URL) return
  await getDatabase()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), isNull(sessions.revokedAt)))
}
