import { describe, expect, it } from 'vitest'

import { confirmedEvidenceException, isWithinFinalityRecheckWindow } from './finality'
import { classifyCheckoutConfirmation } from './checkout-confirmation'

const hashA = `0x${'aa'.repeat(32)}` as `0x${string}`
const hashB = `0x${'bb'.repeat(32)}` as `0x${string}`

describe('post-confirmation protection', () => {
  it('rechecks only the bounded finality window', () => {
    const now = new Date('2026-11-23T12:00:00Z')
    expect(isWithinFinalityRecheckWindow(new Date('2026-11-18T02:27:10Z'), now)).toBe(true)
    expect(isWithinFinalityRecheckWindow(new Date('2026-11-16T11:59:59Z'), now)).toBe(false)
    expect(isWithinFinalityRecheckWindow(null, now)).toBe(false)
  })

  it('flags a missing, moved, or changed canonical block', () => {
    const saved = { blockNumber: 100n, blockHash: hashA }
    const stable = { status: 'confirmed' as const, blockNumber: 100n, blockHash: hashA, minedAt: new Date(), confirmations: 30 }
    expect(confirmedEvidenceException(saved, stable)).toBeNull()
    expect(confirmedEvidenceException(saved, { ...stable, blockHash: hashB })).toMatch(/block changed/i)
    expect(confirmedEvidenceException(saved, { status: 'pending', confirmations: 0 })).toMatch(/no longer confirmed/i)
    expect(confirmedEvidenceException({ blockNumber: null, blockHash: null }, stable)).toMatch(/missing stored block/i)
  })

  it('makes evidence errors terminal for UI polling', () => {
    expect(classifyCheckoutConfirmation(422, undefined)).toBe('needs_review')
    expect(classifyCheckoutConfirmation(409, undefined)).toBe('needs_review')
    expect(classifyCheckoutConfirmation(202, 'needs_review')).toBe('needs_review')
    expect(classifyCheckoutConfirmation(202, 'confirming')).toBe('confirming')
    expect(classifyCheckoutConfirmation(200, 'confirmed')).toBe('confirmed')
  })
})
