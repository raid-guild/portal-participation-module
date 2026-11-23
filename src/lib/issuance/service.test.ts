import { describe, expect, it } from 'vitest'

import { assertIndependentReviewer, snapshotIsStale } from './service'

describe('independent immutable issuance review', () => {
  const snapshot = { payloadSha256: 'a'.repeat(64), policyVersion: 'dao-approved-v1', paymentBasis: 'gross' }
  const policy = { version: 'dao-approved-v1', paymentBasis: 'gross' as const, sharePriceMinorUnits: 250, maxMonthlyMinorUnits: 20_000 }

  it('rejects approval by the snapshot creator', () => {
    expect(() => assertIndependentReviewer('admin-1', 'admin-1')).toThrow('creator cannot review')
    expect(() => assertIndependentReviewer('admin-1', 'admin-2')).not.toThrow()
  })

  it('blocks stale payment evidence and changed governance policy', () => {
    expect(snapshotIsStale(snapshot, snapshot.payloadSha256, policy)).toBe(false)
    expect(snapshotIsStale(snapshot, 'b'.repeat(64), policy)).toBe(true)
    expect(snapshotIsStale(snapshot, snapshot.payloadSha256, { ...policy, version: 'dao-approved-v2' })).toBe(true)
    expect(snapshotIsStale(snapshot, snapshot.payloadSha256, { ...policy, paymentBasis: 'unresolved' })).toBe(true)
  })
})
