import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  appRoleAssignments, auditEvents, participationMetricApprovals,
  participationMetricImports, participationMetricLines, walletLinks,
} from '../db/schema'

const mocks = vi.hoisted(() => ({ database: null as unknown }))
vi.mock('../db/client', () => ({ getDatabase: () => mocks.database }))

import { approveParticipationMetricImport, compareApprovedMetricCycles, getApprovedParticipationMetrics } from './approval'

function fixture(options: { admin?: boolean; verified?: boolean; flagged?: boolean } = {}) {
  const contentSha256 = 'a'.repeat(64)
  const approvedAt = new Date('2026-11-23T00:00:00Z')
  const metricImport = { id: 'import-1', contentSha256, cycleKey: 'cycle-1', snapshotKey: '2026-W47', generatedAt: new Date('2026-11-22T00:00:00Z') }
  const line = { importId: 'import-1', userId: 'subject', walletAddress: '0x1111111111111111111111111111111111111111', auditFlags: options.flagged ? ['needs_review'] : [], engagementScore: 20, stewardshipScore: 60, contributionScore: 70, totalScore: 150, evidenceRefs: ['private://not-for-participant'] }
  const wallet = { address: line.walletAddress, chainId: 100, verifiedAt: options.verified === false ? null : new Date(), revokedAt: null }
  const approval = { id: 'approval-1', importId: 'import-1', contentSha256, approvedByUserId: 'admin', approvedAt }
  const writes: Array<{ table: unknown; values: Record<string, unknown> }> = []
  let existingApproval = false
  const database = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({
      limit: async () => table === appRoleAssignments ? (options.admin ? [{ id: 'role' }] : [])
        : table === participationMetricImports ? [metricImport]
          : table === participationMetricApprovals ? (existingApproval ? [approval] : []) : [],
      then: (resolve: (value: unknown[]) => unknown) => resolve(table === participationMetricLines ? [line]
        : table === walletLinks ? [wallet]
          : table === participationMetricApprovals ? [approval]
            : table === participationMetricImports ? [metricImport] : []),
    }) }) }),
    insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => {
      writes.push({ table, values })
      if (table === participationMetricApprovals) existingApproval = true
      return { returning: async () => [approval] }
    } }),
    transaction: async (action: (tx: unknown) => Promise<unknown>) => action(database),
  }
  mocks.database = database
  return { writes, approval }
}

describe('Prism approval isolation', () => {
  beforeEach(() => { mocks.database = null })

  it('requires a current explicit app admin and writes only metric approval/audit rows', async () => {
    const denied = fixture({ admin: false })
    await expect(approveParticipationMetricImport('import-1', 'admin')).rejects.toThrow('Current app-admin')
    expect(denied.writes).toEqual([])
    const allowed = fixture({ admin: true })
    expect(await approveParticipationMetricImport('import-1', 'admin')).toEqual(allowed.approval)
    expect(allowed.writes.map((write) => write.table)).toEqual([participationMetricApprovals, auditEvents])
  })

  it('shows only approved unflagged metrics from a verified active wallet and no raw evidence references', async () => {
    fixture({ admin: true })
    expect(await getApprovedParticipationMetrics('subject')).toMatchObject({ totalScore: 150, cycleKey: 'cycle-1' })
    expect(JSON.stringify(await getApprovedParticipationMetrics('subject'))).not.toContain('private://')
    fixture({ verified: false })
    expect(await getApprovedParticipationMetrics('subject')).toBeNull()
    fixture({ flagged: true })
    expect(await getApprovedParticipationMetrics('subject')).toBeNull()
  })

  it('ranks a newer eligible evidence window above an older cycle approved later', () => {
    const olderApprovedLater = { importId: 'older', windowEndsAt: new Date('2026-11-01T00:00:00Z'), generatedAt: new Date('2026-11-01T01:00:00Z'), approvedAt: new Date('2026-11-24T00:00:00Z') }
    const newerApprovedEarlier = { importId: 'newer', windowEndsAt: new Date('2026-11-22T00:00:00Z'), generatedAt: new Date('2026-11-22T01:00:00Z'), approvedAt: new Date('2026-11-23T00:00:00Z') }
    expect([olderApprovedLater, newerApprovedEarlier].sort(compareApprovedMetricCycles).map((item) => item.importId))
      .toEqual(['newer', 'older'])
  })

  it('returns the newer approved cycle for a participant even when an older import was approved later', async () => {
    const address = '0x1111111111111111111111111111111111111111'
    const lines = [
      { importId: 'old', userId: 'subject', walletAddress: address, auditFlags: [], engagementScore: 0, stewardshipScore: 0, contributionScore: 0, totalScore: 0 },
      { importId: 'new', userId: 'subject', walletAddress: address, auditFlags: [], engagementScore: 20, stewardshipScore: 60, contributionScore: 70, totalScore: 150 },
    ]
    const imports = [
      { id: 'old', contentSha256: 'a'.repeat(64), cycleKey: 'old-cycle', snapshotKey: '2026-W44', windowEndsAt: new Date('2026-11-01T00:00:00Z'), generatedAt: new Date('2026-11-01T01:00:00Z') },
      { id: 'new', contentSha256: 'b'.repeat(64), cycleKey: 'new-cycle', snapshotKey: '2026-W47', windowEndsAt: new Date('2026-11-22T00:00:00Z'), generatedAt: new Date('2026-11-22T01:00:00Z') },
    ]
    const approvals = [
      { importId: 'old', contentSha256: 'a'.repeat(64), approvedAt: new Date('2026-11-24T00:00:00Z') },
      { importId: 'new', contentSha256: 'b'.repeat(64), approvedAt: new Date('2026-11-23T00:00:00Z') },
    ]
    mocks.database = { select: () => ({ from: (table: unknown) => ({ where: () => ({
      then: (resolve: (value: unknown[]) => unknown) => resolve(table === participationMetricLines ? lines
        : table === walletLinks ? [{ address, chainId: 100, verifiedAt: new Date(), revokedAt: null }]
          : table === participationMetricApprovals ? approvals
            : table === participationMetricImports ? imports : []),
    }) }) }) }
    expect(await getApprovedParticipationMetrics('subject')).toMatchObject({ cycleKey: 'new-cycle', totalScore: 150 })
  })
})
