import { describe, expect, it } from 'vitest'

import { currentPeriodKey, MAX_MEMBER_PAYMENT_MINOR_UNITS, subscriptionShares } from './report'

describe('admin participation report calculations', () => {
  it('prices member subscription shares at the $2.50 discounted rate', () => {
    expect(subscriptionShares(2_000)).toBe(8)
    expect(subscriptionShares(20_000)).toBe(80)
  })

  it('defines an 80-share maximum from the $200 monthly cap', () => {
    expect(subscriptionShares(MAX_MEMBER_PAYMENT_MINOR_UNITS)).toBe(80)
  })

  it('uses a stable UTC monthly period key', () => {
    expect(currentPeriodKey(new Date('2026-08-31T23:59:00-06:00'))).toBe('2026-09')
  })
})
