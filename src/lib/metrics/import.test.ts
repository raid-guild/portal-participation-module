import { describe, expect, it } from 'vitest'

import { validateParticipationMetricImport } from './import'

const validInput = {
  artifactSha256: 'a'.repeat(64),
  cycleKey: '2026-07-01:2026-08-31',
  generatedAt: '2026-08-17T14:00:00.000Z',
  members: [{
    auditFlags: [],
    contributionScore: 70,
    displayName: 'Example Raider',
    engagementScore: 20,
    evidenceRefs: ['prism://request/149/activity-report.json'],
    stewardshipScore: 60,
    walletAddress: '0x1111111111111111111111111111111111111111',
  }],
  schemaVersion: 1,
  snapshotKey: '2026-W34',
  sourceRunId: 'task-run-123',
  sourceSystem: 'prism',
  sourceTaskKey: 'weekly-participation-admin-snapshot',
  status: 'provisional',
  windowEndsAt: '2026-08-17T14:00:00.000Z',
  windowStartsAt: '2026-07-01T00:00:00.000Z',
}

describe('participation metric import validation', () => {
  it('accepts the versioned provisional Prism snapshot contract', () => {
    const result = validateParticipationMetricImport(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.members[0].walletAddress).toBeTruthy()
  })

  it('rejects scores outside the Participation Steward rubric', () => {
    const result = validateParticipationMetricImport({
      ...validInput,
      members: [{ ...validInput.members[0], contributionScore: 71 }],
    })
    expect(result).toEqual({
      ok: false,
      message: 'contributionScore for 0x1111111111111111111111111111111111111111 must be 0 or 70.',
    })
  })

  it('rejects duplicate wallets and authoritative statuses', () => {
    expect(validateParticipationMetricImport({
      ...validInput,
      members: [...validInput.members, ...validInput.members],
    }).ok).toBe(false)
    expect(validateParticipationMetricImport({ ...validInput, status: 'approved' })).toEqual({
      ok: false,
      message: 'Only provisional snapshots may be imported.',
    })
  })
})
