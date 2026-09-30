import { encodeFunctionData, parseAbi } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { createLivePaymentIntent, validateTransferCall } from './live-stablecoin'
import { confirmLivePayment } from './live-stablecoin'
import { deriveCapabilities } from '../domain/participation'
import { payments as paymentsTable } from '../db/schema'
import { getParticipantDashboardState } from '../dashboard/service'

const testDoubles = vi.hoisted(() => ({
  database: null as unknown,
  publicClient: null as unknown,
}))

vi.mock('../db/client', () => ({ getDatabase: () => testDoubles.database }))
vi.mock('../dao/membership', () => ({ getLatestSuccessfulMembershipRun: async () => null }))
vi.mock('viem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem')>()),
  createPublicClient: () => testDoubles.publicClient,
}))

const abi = parseAbi(['function transfer(address to, uint256 value) returns (bool)'])
const sender = '0x1111111111111111111111111111111111111111'
const token = '0x2222222222222222222222222222222222222222'
const treasury = '0x3333333333333333333333333333333333333333'
const data = encodeFunctionData({ abi, functionName: 'transfer', args: [treasury, 20n * 10n ** 18n] })

describe('live wxDAI transfer validation', () => {
  it('rejects retired cohort plans before any database lookup', async () => {
    await expect(createLivePaymentIntent('legacy-user', 'cohort_grad_20'))
      .rejects.toMatchObject({ status: 400 })
    await expect(createLivePaymentIntent('legacy-user', 'cohort_participant_20'))
      .rejects.toMatchObject({ status: 400 })
  })

  it('confirms an existing legacy cohort intent without granting share eligibility', async () => {
    const hash = `0x${'a1'.repeat(32)}` as `0x${string}`
    const insertedPayments: Array<Record<string, unknown>> = []
    let lookup = 0
    const intent = {
      amountAtomic: (20n * 10n ** 18n).toString(),
      amountMinorUnits: 2_000,
      chainId: 100,
      currency: 'USD',
      expectedSender: sender,
      expiresAt: new Date(Date.now() + 60_000),
      id: 'legacy-intent',
      periodKey: '2026-09',
      planKey: 'cohort_grad_20',
      provider: 'gnosis-wxdai-direct',
      status: 'pending',
      userId: 'legacy-user',
    }
    const database = {
      select: () => ({ from: () => ({
        where: () => ({
          limit: async () => (++lookup === 1 ? [intent] : []),
          then: (resolve: (rows: Array<Record<string, unknown>>) => unknown) => resolve(insertedPayments),
        }),
      }) }),
      insert: (table: unknown) => ({ values: async (row: Record<string, unknown>) => {
        if (table === paymentsTable) insertedPayments.push(row)
      } }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      transaction: async (action: (tx: unknown) => Promise<void>) => action(database),
    }
    testDoubles.database = database
    testDoubles.publicClient = {
      getBlockNumber: async () => 111n,
      getTransaction: async () => ({
        from: sender,
        input: data,
        to: token,
      }),
      getTransactionReceipt: async () => ({ blockNumber: 100n, status: 'success' }),
    }

    vi.stubEnv('GNOSIS_WXDAI_ADDRESS', token)
    vi.stubEnv('GNOSIS_TREASURY_ADDRESS', treasury)
    const result = await confirmLivePayment('legacy-user', 'legacy-intent', hash)
    vi.unstubAllEnvs()

    expect(result).toEqual({ confirmations: 12, status: 'confirmed' })
    expect(insertedPayments).toHaveLength(1)
    expect(insertedPayments[0]).toMatchObject({
      intentId: 'legacy-intent',
      planKey: 'cohort_grad_20',
      status: 'confirmed',
    })
    const state = await getParticipantDashboardState('legacy-user', ['cohort_grad'])
    expect(state).toMatchObject({
      amountUSD: 20,
      billingStatus: 'active',
      credentials: ['cohort_grad'],
    })
    expect(deriveCapabilities({ billingStatus: 'active', credentials: ['cohort_grad'] }))
      .not.toContain('shares.subscription_eligible')
  })
  const valid = {
    expectedAmountAtomic: (20n * 10n ** 18n).toString(),
    expectedRecipient: treasury,
    expectedSender: sender,
    expectedToken: token,
    from: sender,
    input: data,
    to: token,
  } as const

  it('accepts an exact transfer match', () => {
    expect(() => validateTransferCall(valid)).not.toThrow()
  })

  it('rejects a different payer, treasury, token, or amount', () => {
    expect(() => validateTransferCall({ ...valid, from: treasury })).toThrow('sender')
    expect(() => validateTransferCall({ ...valid, to: treasury })).toThrow('token')
    expect(() => validateTransferCall({
      ...valid,
      input: encodeFunctionData({ abi, functionName: 'transfer', args: [sender, 20n * 10n ** 18n] }),
    })).toThrow('recipient')
    expect(() => validateTransferCall({ ...valid, expectedAmountAtomic: '1' })).toThrow('amount')
  })
})
