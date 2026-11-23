import { describe, expect, it, vi } from 'vitest'

import { auditEvents, participationMetricImports, participationMetricLines, walletLinks } from '../db/schema'

const mocks = vi.hoisted(() => ({ database: null as unknown }))
vi.mock('../db/client', () => ({ getDatabase: () => mocks.database }))

import { importParticipationMetrics, metricContentSha256, type ParticipationMetricImportInput } from './import'

const input: ParticipationMetricImportInput = {
  artifactSha256: 'a'.repeat(64), cycleKey: '2026-11', generatedAt: '2026-11-23T00:00:00Z',
  members: [{ walletAddress: '0x1111111111111111111111111111111111111111', engagementScore: 20, stewardshipScore: 60, contributionScore: 70, auditFlags: [], evidenceRefs: [] }],
  schemaVersion: 1, snapshotKey: '2026-W47', sourceRunId: 'run-1',
  sourceSystem: 'prism', sourceTaskKey: 'weekly-participation-admin-snapshot', status: 'provisional',
  windowEndsAt: '2026-11-23T00:00:00Z', windowStartsAt: '2026-11-16T00:00:00Z',
}

function fixture(options: { verified?: boolean; existing?: { contentSha256: string; artifactSha256: string } } = {}) {
  const writes: Array<{ table: unknown; values: unknown }> = []
  const record = { id: 'import-1', contentSha256: metricContentSha256(input), matchedCount: options.verified ? 1 : 0, memberCount: 1, unmatchedCount: options.verified ? 0 : 1, status: 'provisional', snapshotKey: input.snapshotKey }
  const database = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({
      limit: async () => table === participationMetricImports && options.existing ? [options.existing] : [],
      then: (resolve: (rows: unknown[]) => unknown) => resolve(table === walletLinks ? [{ address: input.members[0].walletAddress, userId: 'subject', chainId: 100, verifiedAt: options.verified ? new Date() : null, revokedAt: null }] : []),
    }) }) }),
    transaction: async (action: (tx: unknown) => Promise<unknown>) => action(database),
    insert: (table: unknown) => ({ values: (values: unknown) => {
      writes.push({ table, values })
      return { returning: async () => [record] }
    } }),
  }
  mocks.database = database
  return { writes }
}

describe('Prism import write boundary', () => {
  it('does not match an unverified wallet or mutate billing, membership, entitlements, or issuance', async () => {
    const state = fixture({ verified: false })
    const result = await importParticipationMetrics(input)
    expect(result.import.matchedCount).toBe(0)
    expect(state.writes.map((write) => write.table)).toEqual([participationMetricImports, participationMetricLines, auditEvents])
    expect((state.writes[1].values as Array<{ userId?: string }>)[0].userId).toBeUndefined()
  })

  it('matches an active verified wallet and detects a changed normalized payload under the same source run', async () => {
    const state = fixture({ verified: true })
    const result = await importParticipationMetrics(input)
    expect(result.import.matchedCount).toBe(1)
    expect((state.writes[1].values as Array<{ userId?: string }>)[0].userId).toBe('subject')
    fixture({ existing: { contentSha256: metricContentSha256(input), artifactSha256: input.artifactSha256 } })
    const changed = await importParticipationMetrics({ ...input, members: [{ ...input.members[0], engagementScore: 0 }] })
    expect(changed.conflict).toBe(true)
  })
})
