import { describe, expect, it } from 'vitest'

import {
  calculateMemberShares,
  deriveCapabilities,
  MEMBER_SUBSCRIPTION_DISCOUNT_PERCENT,
  MEMBER_SUBSCRIPTION_SHARE_PRICE_USD,
  resolveParticipationClass,
  STANDARD_SHARE_PRICE_USD,
} from './participation'

describe('participation domain', () => {
  it('gives RaidGuild membership precedence over cohort credentials', () => {
    expect(resolveParticipationClass(['cohort_grad', 'raidguild_member'])).toBe('member')
  })

  it('keeps member coworking access when the optional subscription is canceled', () => {
    const capabilities = deriveCapabilities({
      billingStatus: 'canceled',
      credentials: ['raidguild_member'],
    })

    expect(capabilities).toContain('coworking.guild')
    expect(capabilities).not.toContain('shares.subscription_eligible')
  })

  it('keeps cohort participation available regardless of payment state', () => {
    for (const credentials of [['cohort_grad'], ['cohort_participant']] as const) {
      const active = deriveCapabilities({ billingStatus: 'active', credentials: [...credentials] })
      expect(active).toContain('coworking.standard')
      expect(deriveCapabilities({ billingStatus: 'not_started', credentials: [...credentials] })).toEqual(active)
      expect(deriveCapabilities({ billingStatus: 'past_due', credentials: [...credentials] })).toEqual(active)
      expect(deriveCapabilities({ billingStatus: 'canceled', credentials: [...credentials] })).toEqual(active)
    }
  })

  it('never grants shares to a cohort graduate', () => {
    const capabilities = deriveCapabilities({
      billingStatus: 'active',
      credentials: ['cohort_grad'],
    })

    expect(capabilities).not.toContain('shares.subscription_eligible')
  })

  it('calculates the approved member range at 2.5 per share', () => {
    expect(calculateMemberShares(20)).toBe(8)
    expect(calculateMemberShares(200)).toBe(80)
    expect(() => calculateMemberShares(220)).toThrow(RangeError)
  })

  it('defines the subscription rate as a 50% discount from the standard price', () => {
    expect(STANDARD_SHARE_PRICE_USD).toBe(5)
    expect(MEMBER_SUBSCRIPTION_SHARE_PRICE_USD).toBe(2.5)
    expect(MEMBER_SUBSCRIPTION_DISCOUNT_PERCENT).toBe(50)
    expect(MEMBER_SUBSCRIPTION_SHARE_PRICE_USD / STANDARD_SHARE_PRICE_USD).toBe(0.5)
  })
})
