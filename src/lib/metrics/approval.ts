import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'

import { getDatabase } from '../db/client'
import {
  appRoleAssignments, auditEvents, participationMetricApprovals,
  participationMetricImports, participationMetricLines, walletLinks,
} from '../db/schema'
import { isActiveVerifiedGnosisWallet } from './wallet-policy'

export class MetricApprovalError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}

export async function approveParticipationMetricImport(importId: string, reviewerUserId: string) {
  const database = getDatabase()
  return database.transaction(async (transaction) => {
    const [role] = await transaction.select({ id: appRoleAssignments.id }).from(appRoleAssignments).where(and(
      eq(appRoleAssignments.userId, reviewerUserId), eq(appRoleAssignments.role, 'app_admin'),
    )).limit(1)
    if (!role) throw new MetricApprovalError('Current app-admin role required.', 403)
    const [metricImport] = await transaction.select().from(participationMetricImports).where(eq(participationMetricImports.id, importId)).limit(1)
    if (!metricImport) throw new MetricApprovalError('Metric import not found.', 404)
    if (!metricImport.contentSha256) throw new MetricApprovalError('Legacy import has no server-computed content hash; reimport a new Prism run.')
    const [existing] = await transaction.select().from(participationMetricApprovals).where(eq(participationMetricApprovals.importId, importId)).limit(1)
    if (existing) return existing
    const [approval] = await transaction.insert(participationMetricApprovals).values({
      importId, contentSha256: metricImport.contentSha256, approvedByUserId: reviewerUserId,
    }).returning()
    await transaction.insert(auditEvents).values({
      action: 'participation_metrics.approved', actorType: 'portal_user', actorId: reviewerUserId,
      entityType: 'participation_metric_import', entityId: importId,
      details: { contentSha256: metricImport.contentSha256 },
    })
    return approval
  })
}

export async function getMetricApproval(importId: string) {
  const database = getDatabase()
  const [approval] = await database.select().from(participationMetricApprovals).where(eq(participationMetricApprovals.importId, importId)).limit(1)
  return approval ?? null
}

export async function getApprovedParticipationMetrics(userId: string) {
  const database = getDatabase()
  const lines = await database.select().from(participationMetricLines).where(eq(participationMetricLines.userId, userId))
  const cleanLines = lines.filter((line) => line.auditFlags.length === 0)
  if (!cleanLines.length) return null
  const activeWallets = await database.select({ address: walletLinks.address, chainId: walletLinks.chainId, verifiedAt: walletLinks.verifiedAt, revokedAt: walletLinks.revokedAt }).from(walletLinks).where(and(
    eq(walletLinks.userId, userId), eq(walletLinks.chainId, 100),
    isNull(walletLinks.revokedAt), isNotNull(walletLinks.verifiedAt),
  ))
  const addresses = new Set(activeWallets.filter(isActiveVerifiedGnosisWallet).map((wallet) => wallet.address.toLowerCase()))
  const eligibleLines = cleanLines.filter((line) => addresses.has(line.walletAddress.toLowerCase()))
  if (!eligibleLines.length) return null
  const importIds = [...new Set(eligibleLines.map((line) => line.importId))]
  const [approvals, imports] = await Promise.all([
    database.select().from(participationMetricApprovals).where(inArray(participationMetricApprovals.importId, importIds)),
    database.select().from(participationMetricImports).where(inArray(participationMetricImports.id, importIds)),
  ])
  const importById = new Map(imports.map((item) => [item.id, item]))
  for (const approval of approvals.sort((a, b) => compareApprovedMetricCycles(
    { windowEndsAt: importById.get(a.importId)?.windowEndsAt ?? null, generatedAt: importById.get(a.importId)?.generatedAt ?? null, approvedAt: a.approvedAt, importId: a.importId },
    { windowEndsAt: importById.get(b.importId)?.windowEndsAt ?? null, generatedAt: importById.get(b.importId)?.generatedAt ?? null, approvedAt: b.approvedAt, importId: b.importId },
  ))) {
    const metricImport = importById.get(approval.importId)
    if (!metricImport || metricImport.contentSha256 !== approval.contentSha256) continue
    const matches = eligibleLines.filter((item) => item.importId === approval.importId)
    if (matches.length !== 1) continue
    const line = matches[0]
    return {
      cycleKey: metricImport.cycleKey,
      snapshotKey: metricImport.snapshotKey,
      generatedAt: metricImport.generatedAt.toISOString(),
      approvedAt: approval.approvedAt.toISOString(),
      engagementScore: line.engagementScore,
      stewardshipScore: line.stewardshipScore,
      contributionScore: line.contributionScore,
      totalScore: line.totalScore,
    }
  }
  return null
}

export function compareApprovedMetricCycles(
  a: { windowEndsAt: Date | null; generatedAt: Date | null; approvedAt: Date; importId: string },
  b: { windowEndsAt: Date | null; generatedAt: Date | null; approvedAt: Date; importId: string },
): number {
  return (b.windowEndsAt?.getTime() ?? 0) - (a.windowEndsAt?.getTime() ?? 0) ||
    (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0) ||
    b.approvedAt.getTime() - a.approvedAt.getTime() || a.importId.localeCompare(b.importId)
}
