import { describe, expect, it } from 'vitest'

import {
  getMockEntitlementSnapshot,
  planEntitlementReconciliation,
} from './service'

describe('entitlement service', () => {
  it('resolves the member subscription capability from normalized state', () => {
    const snapshot = getMockEntitlementSnapshot('portal-1042', '2026-08-13T00:00:00.000Z')

    expect(snapshot?.participationClass).toBe('member')
    expect(snapshot?.capabilities).toContain('shares.subscription_eligible')
  })

  it('retains free cohort capabilities for a past-due legacy participant', () => {
    const snapshot = getMockEntitlementSnapshot('portal-1317')

    expect(snapshot?.capabilities).toContain('coworking.standard')
    expect(snapshot?.capabilities).not.toContain('shares.subscription_eligible')
  })

  it('plans replace operations without mutating a consumer', () => {
    const snapshot = getMockEntitlementSnapshot('portal-1228')
    expect(snapshot).not.toBeNull()

    const actions = planEntitlementReconciliation(snapshot!, ['portal', 'discord'])
    expect(actions.map((action) => action.target)).toEqual(['portal', 'discord'])
  })
})
