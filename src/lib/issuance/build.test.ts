import { describe, expect, it } from 'vitest'

import { buildIssuancePayload, issuancePayloadHash, issuanceSourceManifest, periodCutoff, type IssuanceInput } from './build'

const wallet = '0x1111111111111111111111111111111111111111'
const input: IssuanceInput = {
  periodKey: '2026-10', cutoffAt: '2026-11-01T00:00:00.000Z',
  run: {
    id: 'run-1', chainId: 100, daoAddress: '0x2222222222222222222222222222222222222222',
    sharesTokenAddress: '0x3333333333333333333333333333333333333333',
    cutoffBlockNumber: '49300000', cutoffBlockHash: `0x${'aa'.repeat(32)}`,
    thresholdRaw: (100n * 10n ** 18n).toString(), tokenDecimals: 18,
  },
  policy: { version: 'dao-approved-v1', paymentBasis: 'gross', sharePriceMinorUnits: 250, maxMonthlyMinorUnits: 20000 },
  payments: [
    { id: 'pay-b', userId: 'user-1', planKey: 'member_share_20', status: 'confirmed', amountMinorUnits: 2000, currency: 'USD', confirmedAt: '2026-10-11T10:00:00Z', rail: 'stablecoin_direct', provider: 'gnosis-wxdai-direct', chainId: 100, transactionHash: `0x${'bb'.repeat(32)}`, blockNumber: '100' },
    { id: 'pay-a', userId: 'user-1', planKey: 'member_share_40', status: 'confirmed', amountMinorUnits: 4000, currency: 'USD', confirmedAt: '2026-10-10T10:00:00Z', rail: 'stablecoin_direct', provider: 'gnosis-wxdai-direct', chainId: 100, transactionHash: `0x${'cc'.repeat(32)}`, blockNumber: '99' },
  ],
  snapshots: [{ userId: 'user-1', walletLinkId: 'link-1', walletAddress: wallet, shareBalanceRaw: (100n * 10n ** 18n).toString(), eligible: true }],
  wallets: [{ id: 'link-1', userId: 'user-1', address: wallet, chainId: 100, verifiedAt: '2026-09-01T00:00:00Z', revokedAt: null }],
}

describe('immutable issuance content', () => {
  it('uses the exact UTC month cutoff and stable canonical hash independent of payment order', () => {
    expect(periodCutoff('2026-10').toISOString()).toBe(input.cutoffAt)
    const first = buildIssuancePayload(input)
    const second = buildIssuancePayload({ ...input, payments: [...input.payments].reverse() })
    expect(first).toEqual(second)
    expect(issuancePayloadHash(first)).toBe(issuancePayloadHash(second))
    expect(first.included).toEqual([{ userId: 'user-1', recipientAddress: wallet,
      paymentIds: ['pay-a', 'pay-b'], amountMinorUnits: 6000,
      shareAmountRaw: (24n * 10n ** 18n).toString() }])
    expect(issuanceSourceManifest(first)).toEqual([
      { paymentId: 'pay-a', included: true }, { paymentId: 'pay-b', included: true },
    ])
  })

  it('excludes a reorged/refunded source and changes the frozen hash', () => {
    const baseline = buildIssuancePayload(input)
    const changed = buildIssuancePayload({ ...input, payments: input.payments.map((payment) =>
      payment.id === 'pay-a' ? { ...payment, status: 'failed' } : payment) })
    expect(changed.excluded).toEqual([{ paymentId: 'pay-a', userId: 'user-1', reason: 'unsupported_or_unconfirmed_payment_evidence' }])
    expect(changed.blockers).toContain('Unresolved excluded member-plan payments require independent review.')
    expect(issuancePayloadHash(changed)).not.toBe(issuancePayloadHash(baseline))
  })

  it('requires one currently verified eligible recipient and enforces the cap', () => {
    const revoked = buildIssuancePayload({ ...input, wallets: [{ ...input.wallets[0], revokedAt: '2026-11-02T00:00:00Z' }] })
    expect(revoked.included).toEqual([])
    expect(revoked.excluded).toHaveLength(2)
    const overCap = buildIssuancePayload({ ...input, payments: [
      { ...input.payments[0], id: 'pay-200', planKey: 'member_share_200', amountMinorUnits: 20000 },
      { ...input.payments[0], id: 'pay-20' },
    ] })
    expect(overCap.included).toEqual([])
    expect(overCap.excluded[0].reason).toBe('monthly_cap_or_amount_invalid')
  })

  it('keeps the proposed or unresolved fee policy review-only', () => {
    const draft = buildIssuancePayload({ ...input, policy: { ...input.policy, version: 'proposed-v1', paymentBasis: 'unresolved' } })
    expect(draft.blockers).toHaveLength(2)
  })

  it('rejects duplicate source attribution before inserting a frozen manifest', () => {
    const payload = buildIssuancePayload(input)
    expect(() => issuanceSourceManifest({ ...payload, excluded: [
      ...payload.excluded, { paymentId: 'pay-a', userId: 'user-1', reason: 'duplicate' },
    ] })).toThrow('duplicate source payment')
  })
})
