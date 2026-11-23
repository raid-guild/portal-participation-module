import { describe, expect, it } from 'vitest'

import { selectCheckoutRecovery, type CheckoutHistoryCandidate } from './checkout-recovery'

const base: CheckoutHistoryCandidate = {
  id: 'intent', status: 'pending', transactionHash: null, confirmations: 0,
  requiredConfirmations: 12, createdAt: '2026-11-18T02:00:00Z', amountMinorUnits: 2000,
}

describe('checkout refresh recovery', () => {
  it('recovers a durable pending observation instead of offering another transfer', () => {
    const state = selectCheckoutRecovery([{ ...base, transactionHash: `0x${'aa'.repeat(32)}`, confirmations: 4 }])
    expect(state.activeObservation?.confirmations).toBe(4)
    expect(state.recoverableIntents).toEqual([])
  })

  it('lets a pre-observation expired intent be selected for hash verification', () => {
    const state = selectCheckoutRecovery([{ ...base, status: 'expired' }])
    expect(state.recoverableIntents.map((item) => item.id)).toEqual(['intent'])
  })

  it('restores an explicit review state without restarting polling', () => {
    const state = selectCheckoutRecovery([{ ...base, status: 'needs_review', transactionHash: `0x${'aa'.repeat(32)}` }])
    expect(state.activeObservation).toBeNull()
    expect(state.reviewObservation?.status).toBe('needs_review')
  })
})
