import { describe, expect, it } from 'vitest'

import { isActiveVerifiedGnosisWallet } from './wallet-policy'

describe('Prism identity matching boundary', () => {
  const verifiedAt = new Date('2026-11-01T00:00:00Z')
  it('requires an active Portal-verified Gnosis wallet', () => {
    expect(isActiveVerifiedGnosisWallet({ chainId: 100, verifiedAt, revokedAt: null })).toBe(true)
    expect(isActiveVerifiedGnosisWallet({ chainId: 100, verifiedAt: null, revokedAt: null })).toBe(false)
    expect(isActiveVerifiedGnosisWallet({ chainId: 100, verifiedAt, revokedAt: new Date() })).toBe(false)
    expect(isActiveVerifiedGnosisWallet({ chainId: 1, verifiedAt, revokedAt: null })).toBe(false)
  })
})
