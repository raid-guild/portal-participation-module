import { describe, expect, it } from 'vitest'

import { MockPaymentAdapter } from './mock-adapter'
import { getPaymentPlan, isPaymentPlanKey } from './plans'
import {
  GNOSIS_CHAIN_ID,
  RAIDGUILD_TREASURY,
  StablecoinDirectAdapter,
  WXDAI_ADDRESS,
} from './stablecoin-direct-adapter'

describe('payment adapter boundary', () => {
  it('keeps provider identifiers out of the application plan catalog', () => {
    expect(getPaymentPlan('member_share_80')).toMatchObject({
      amount: { currency: 'USD', minorUnits: 8_000 },
      eligibleClass: 'member',
      sharesEligible: true,
    })
  })

  it('creates a mock recurring checkout through the common contract', async () => {
    const adapter = new MockPaymentAdapter()
    const session = await adapter.createPaymentSession({
      cancelURL: 'https://example.test/cancel',
      planKey: 'member_share_20',
      portalUserID: '42',
      successURL: 'https://example.test/success',
    })

    expect(adapter.capabilities.automaticRenewal).toBe(true)
    expect(session).toMatchObject({ kind: 'redirect', rail: 'fiat_recurring' })
  })

  it('creates exact wxDAI transfer instructions to the RaidGuild treasury', async () => {
    const adapter = new StablecoinDirectAdapter()
    const session = await adapter.createPaymentSession({
      cancelURL: 'https://example.test/cancel',
      expectedWalletAddress: '0x1111111111111111111111111111111111111111',
      planKey: 'member_share_80',
      portalUserID: '42',
      successURL: 'https://example.test/success',
    })

    expect(session).toMatchObject({
      amountAtomic: '80000000000000000000',
      chainId: GNOSIS_CHAIN_ID,
      kind: 'onchain_transfer',
      recipient: RAIDGUILD_TREASURY,
      tokenAddress: WXDAI_ADDRESS,
    })
    expect(adapter.capabilities.automaticRenewal).toBe(false)
    expect(adapter.capabilities.directToTreasury).toBe(true)
  })

  it('rejects retired cohort plans for new sessions while keeping their historical keys typed', async () => {
    const adapter = new StablecoinDirectAdapter()

    expect(isPaymentPlanKey('cohort_grad_20')).toBe(false)
    expect(isPaymentPlanKey('cohort_participant_20')).toBe(false)

    await expect(
      adapter.createPaymentSession({
        cancelURL: 'https://example.test/cancel',
        expectedWalletAddress: '0x1111111111111111111111111111111111111111',
        planKey: 'cohort_participant_20',
        portalUserID: '42',
        successURL: 'https://example.test/success',
      }),
    ).rejects.toThrow('no longer available')
  })
})
