import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { getAddress, isAddress } from 'viem'

import { getDatabase } from '../db/client'
import {
  auditEvents,
  participationMetricImports,
  participationMetricLines,
  users,
  walletLinks,
} from '../db/schema'

const snapshotKeyPattern = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/
const cycleKeyPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,79}$/
const sha256Pattern = /^[a-f0-9]{64}$/
const allowedScores = {
  contribution: new Set([0, 70]),
  engagement: new Set([0, 20]),
  stewardship: new Set([0, 60]),
}
const importKeys = new Set([
  'artifactSha256',
  'cycleKey',
  'generatedAt',
  'members',
  'schemaVersion',
  'snapshotKey',
  'sourceRunId',
  'sourceSystem',
  'sourceTaskKey',
  'status',
  'windowEndsAt',
  'windowStartsAt',
])
const memberKeys = new Set([
  'auditFlags',
  'contributionScore',
  'displayName',
  'engagementScore',
  'evidenceRefs',
  'stewardshipScore',
  'walletAddress',
])

export type ParticipationMetricMember = {
  auditFlags?: string[]
  contributionScore: number
  displayName?: string
  engagementScore: number
  evidenceRefs?: string[]
  stewardshipScore: number
  walletAddress: string
}

export type ParticipationMetricImportInput = {
  artifactSha256: string
  cycleKey: string
  generatedAt: string
  members: ParticipationMetricMember[]
  schemaVersion: 1
  snapshotKey: string
  sourceRunId: string
  sourceSystem: 'prism'
  sourceTaskKey: 'weekly-participation-admin-snapshot'
  status: 'provisional'
  windowEndsAt: string
  windowStartsAt: string
}

export type ParticipationMetricValidation =
  | { ok: true; value: ParticipationMetricImportInput }
  | { ok: false; message: string }

function isShortString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum
}

function stringList(value: unknown, maximumItems: number): value is string[] {
  return value === undefined || (
    Array.isArray(value) &&
    value.length <= maximumItems &&
    value.every((item) => isShortString(item, 500))
  )
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key))
}

export function validateParticipationMetricImport(
  value: unknown,
): ParticipationMetricValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'The request body must be an object.' }
  }

  const body = value as Record<string, unknown>
  if (!hasOnlyKeys(body, importKeys)) {
    return { ok: false, message: 'The request contains unsupported fields.' }
  }
  if (body.schemaVersion !== 1) return { ok: false, message: 'schemaVersion must be 1.' }
  if (body.sourceSystem !== 'prism') return { ok: false, message: 'sourceSystem must be prism.' }
  if (body.sourceTaskKey !== 'weekly-participation-admin-snapshot') {
    return { ok: false, message: 'sourceTaskKey is not authorized for this endpoint.' }
  }
  if (body.status !== 'provisional') {
    return { ok: false, message: 'Only provisional snapshots may be imported.' }
  }
  if (!isShortString(body.sourceRunId, 160)) {
    return { ok: false, message: 'sourceRunId is required.' }
  }
  if (typeof body.snapshotKey !== 'string' || !snapshotKeyPattern.test(body.snapshotKey)) {
    return { ok: false, message: 'snapshotKey must use ISO week form YYYY-Www.' }
  }
  if (typeof body.cycleKey !== 'string' || !cycleKeyPattern.test(body.cycleKey)) {
    return { ok: false, message: 'cycleKey is invalid.' }
  }
  if (typeof body.artifactSha256 !== 'string' || !sha256Pattern.test(body.artifactSha256)) {
    return { ok: false, message: 'artifactSha256 must be a lowercase SHA-256 digest.' }
  }
  if (!validDate(body.generatedAt) || !validDate(body.windowStartsAt) || !validDate(body.windowEndsAt)) {
    return { ok: false, message: 'generatedAt and snapshot window dates must be valid timestamps.' }
  }
  if (Date.parse(body.windowStartsAt) >= Date.parse(body.windowEndsAt)) {
    return { ok: false, message: 'windowStartsAt must be before windowEndsAt.' }
  }
  if (!Array.isArray(body.members) || body.members.length > 500) {
    return { ok: false, message: 'members must be an array with at most 500 entries.' }
  }

  const normalizedMembers: ParticipationMetricMember[] = []
  const addresses = new Set<string>()
  for (const item of body.members) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, message: 'Each member must be an object.' }
    }
    const member = item as Record<string, unknown>
    if (!hasOnlyKeys(member, memberKeys)) {
      return { ok: false, message: 'A member contains unsupported fields.' }
    }
    if (typeof member.walletAddress !== 'string' || !isAddress(member.walletAddress)) {
      return { ok: false, message: 'Every member requires a valid walletAddress.' }
    }
    const walletAddress = getAddress(member.walletAddress)
    const addressKey = walletAddress.toLowerCase()
    if (addresses.has(addressKey)) {
      return { ok: false, message: `Duplicate walletAddress: ${walletAddress}` }
    }
    addresses.add(addressKey)
    if (!allowedScores.engagement.has(member.engagementScore as number)) {
      return { ok: false, message: `engagementScore for ${walletAddress} must be 0 or 20.` }
    }
    if (!allowedScores.stewardship.has(member.stewardshipScore as number)) {
      return { ok: false, message: `stewardshipScore for ${walletAddress} must be 0 or 60.` }
    }
    if (!allowedScores.contribution.has(member.contributionScore as number)) {
      return { ok: false, message: `contributionScore for ${walletAddress} must be 0 or 70.` }
    }
    if (member.displayName !== undefined && !isShortString(member.displayName, 160)) {
      return { ok: false, message: `displayName for ${walletAddress} is invalid.` }
    }
    if (!stringList(member.evidenceRefs, 30) || !stringList(member.auditFlags, 20)) {
      return { ok: false, message: `Evidence or audit flags for ${walletAddress} are invalid.` }
    }
    normalizedMembers.push({
      auditFlags: member.auditFlags as string[] | undefined,
      contributionScore: member.contributionScore as number,
      displayName: member.displayName as string | undefined,
      engagementScore: member.engagementScore as number,
      evidenceRefs: member.evidenceRefs as string[] | undefined,
      stewardshipScore: member.stewardshipScore as number,
      walletAddress,
    })
  }

  return {
    ok: true,
    value: {
      artifactSha256: body.artifactSha256,
      cycleKey: body.cycleKey,
      generatedAt: body.generatedAt,
      members: normalizedMembers,
      schemaVersion: 1,
      snapshotKey: body.snapshotKey,
      sourceRunId: body.sourceRunId.trim(),
      sourceSystem: 'prism',
      sourceTaskKey: 'weekly-participation-admin-snapshot',
      status: 'provisional',
      windowEndsAt: body.windowEndsAt,
      windowStartsAt: body.windowStartsAt,
    },
  }
}

export async function importParticipationMetrics(input: ParticipationMetricImportInput) {
  const database = getDatabase()
  const [existing] = await database
    .select()
    .from(participationMetricImports)
    .where(eq(participationMetricImports.sourceRunId, input.sourceRunId))
    .limit(1)

  if (existing) {
    if (existing.artifactSha256 !== input.artifactSha256) {
      return { conflict: true as const, import: existing }
    }
    return { conflict: false as const, idempotent: true as const, import: existing }
  }

  const walletAddresses = input.members.map((member) => member.walletAddress)
  const linkedWallets = walletAddresses.length
    ? await database
        .select({ address: walletLinks.address, userId: walletLinks.userId })
        .from(walletLinks)
        .where(and(
          eq(walletLinks.chainId, 100),
          inArray(walletLinks.address, walletAddresses),
          isNull(walletLinks.revokedAt),
        ))
    : []
  const userByAddress = new Map(
    linkedWallets.map((wallet) => [wallet.address.toLowerCase(), wallet.userId]),
  )
  const matchedCount = input.members.filter((member) => userByAddress.has(member.walletAddress.toLowerCase())).length

  const created = await database.transaction(async (transaction) => {
    const [record] = await transaction
      .insert(participationMetricImports)
      .values({
        artifactSha256: input.artifactSha256,
        cycleKey: input.cycleKey,
        generatedAt: new Date(input.generatedAt),
        matchedCount,
        memberCount: input.members.length,
        schemaVersion: input.schemaVersion,
        snapshotKey: input.snapshotKey,
        sourceRunId: input.sourceRunId,
        sourceSystem: input.sourceSystem,
        sourceTaskKey: input.sourceTaskKey,
        status: input.status,
        unmatchedCount: input.members.length - matchedCount,
        windowEndsAt: new Date(input.windowEndsAt),
        windowStartsAt: new Date(input.windowStartsAt),
      })
      .returning()

    if (input.members.length) {
      await transaction.insert(participationMetricLines).values(
        input.members.map((member) => ({
          auditFlags: member.auditFlags ?? [],
          contributionScore: member.contributionScore,
          displayName: member.displayName,
          engagementScore: member.engagementScore,
          evidenceRefs: member.evidenceRefs ?? [],
          importId: record.id,
          stewardshipScore: member.stewardshipScore,
          totalScore: member.engagementScore + member.stewardshipScore + member.contributionScore,
          userId: userByAddress.get(member.walletAddress.toLowerCase()),
          walletAddress: member.walletAddress,
        })),
      )
    }
    await transaction.insert(auditEvents).values({
      action: 'participation_metrics.provisional_imported',
      actorId: input.sourceTaskKey,
      actorType: 'service',
      details: {
        artifactSha256: input.artifactSha256,
        matchedCount,
        memberCount: input.members.length,
        snapshotKey: input.snapshotKey,
        sourceRunId: input.sourceRunId,
      },
      entityId: record.id,
      entityType: 'participation_metric_import',
    })
    return record
  })

  return { conflict: false as const, idempotent: false as const, import: created }
}

export async function getLatestParticipationMetricSnapshot() {
  const database = getDatabase()
  const [latestImport] = await database
    .select()
    .from(participationMetricImports)
    .orderBy(desc(participationMetricImports.generatedAt))
    .limit(1)
  if (!latestImport) return null

  const lines = await database
    .select({
      auditFlags: participationMetricLines.auditFlags,
      contributionScore: participationMetricLines.contributionScore,
      displayName: participationMetricLines.displayName,
      engagementScore: participationMetricLines.engagementScore,
      evidenceRefs: participationMetricLines.evidenceRefs,
      portalDisplayName: users.displayName,
      portalUserId: users.portalUserId,
      stewardshipScore: participationMetricLines.stewardshipScore,
      totalScore: participationMetricLines.totalScore,
      walletAddress: participationMetricLines.walletAddress,
    })
    .from(participationMetricLines)
    .leftJoin(users, eq(participationMetricLines.userId, users.id))
    .where(eq(participationMetricLines.importId, latestImport.id))

  return { import: latestImport, lines }
}
