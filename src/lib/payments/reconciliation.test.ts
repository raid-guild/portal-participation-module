import { encodeFunctionData, parseAbi } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { auditEvents, paymentIntents, paymentObservations, payments } from '../db/schema'

const mocks = vi.hoisted(() => ({ database: null as unknown, client: null as unknown }))
vi.mock('../db/client', () => ({ getDatabase: () => mocks.database }))
vi.mock('viem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem')>()), createPublicClient: () => mocks.client,
}))

import { reconcileDuePayments, reconcilePaymentObservation } from './live-stablecoin'

const sender = '0x1111111111111111111111111111111111111111' as const
const token = '0x2222222222222222222222222222222222222222' as const
const treasury = '0x3333333333333333333333333333333333333333' as const
const hash = `0x${'aa'.repeat(32)}` as `0x${string}`
const oldBlockHash = `0x${'bb'.repeat(32)}` as `0x${string}`
const currentBlockHash = `0x${'cc'.repeat(32)}` as `0x${string}`
const amount = 20n * 10n ** 18n
const topicAddress = (address: string) => `0x${'0'.repeat(24)}${address.slice(2)}` as `0x${string}`
const transferData = encodeFunctionData({
  abi: parseAbi(['function transfer(address to, uint256 value) returns (bool)']),
  functionName: 'transfer', args: [treasury, amount],
})

function fixture(options: { reorg?: boolean; rpcError?: boolean; missingReceipt?: boolean } = {}) {
  const observation = {
    id: 'observation', intentId: 'intent', chainId: 100, transactionHash: hash,
    status: 'confirmed', confirmations: 12, blockNumber: 100n,
    blockHash: options.reorg ? oldBlockHash : currentBlockHash,
    minedAt: new Date('2026-11-18T02:27:10Z'), attemptCount: 1,
  }
  const intent = {
    id: 'intent', userId: 'user', periodKey: '2026-11', chainId: 100,
    amountAtomic: amount.toString(), expectedSender: sender, recipient: treasury,
    tokenAddress: token, createdAt: new Date('2026-11-18T02:00:00Z'),
    expiresAt: new Date('2026-11-18T03:00:00Z'),
  }
  const payment = { id: 'payment', intentId: 'intent', transactionHash: hash, status: 'confirmed', blockNumber: 100n }
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = []
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = []
  const database = {
    select: (fields?: unknown) => ({ from: (table: unknown) => ({ where: () => ({
      limit: async () => table === paymentObservations ? [observation] : table === paymentIntents ? [intent] : table === payments ? [payment] : [],
      orderBy: () => ({ limit: async () => fields ? [{ id: observation.id }] : [] }),
    }) }) }),
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({ where: async () => {
      updates.push({ table, values })
      if (table === paymentObservations) Object.assign(observation, values)
      if (table === payments) Object.assign(payment, values)
    } }) }),
    insert: (table: unknown) => ({ values: async (values: Record<string, unknown>) => { inserts.push({ table, values }) } }),
    execute: async () => undefined,
    transaction: async (action: (transaction: unknown) => Promise<unknown>) => action(database),
  }
  mocks.database = database
  mocks.client = {
    getChainId: async () => { if (options.rpcError) throw new Error('RPC unavailable'); return 100 },
    getTransaction: async () => ({ from: sender, to: token, input: transferData, value: 0n, blockHash: currentBlockHash }),
    getTransactionReceipt: async () => { if (options.missingReceipt) throw new Error('not indexed'); return { status: 'success', blockNumber: 100n, blockHash: currentBlockHash,
      logs: [{ address: token, topics: [
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        topicAddress(sender), topicAddress(treasury),
      ], data: `0x${amount.toString(16)}` }],
    } },
    getBlock: async () => ({ timestamp: BigInt(Date.parse('2026-11-18T02:27:10Z') / 1000), hash: currentBlockHash }),
    getBlockNumber: async () => 111n,
  }
  return { observation, payment, updates, inserts }
}

describe('durable payment reconciliation', () => {
  beforeEach(() => vi.unstubAllEnvs())

  it('rechecks a duplicate confirmed observation without inserting another payment', async () => {
    const state = fixture()
    const result = await reconcilePaymentObservation('observation')
    expect(result).toEqual({ confirmations: 12, status: 'confirmed' })
    expect(state.updates).toContainEqual(expect.objectContaining({ table: paymentObservations, values: expect.objectContaining({ confirmations: 12, nextAttemptAt: expect.any(Date) }) }))
    expect(state.inserts.filter((item) => item.table === payments)).toHaveLength(0)
  })

  it('excludes a reorged payment from share-review eligibility and retains audit evidence', async () => {
    const state = fixture({ reorg: true })
    const result = await reconcilePaymentObservation('observation')
    expect(result.status).toBe('needs_review')
    expect(state.payment.status).toBe('failed')
    expect(state.observation.status).toBe('needs_review')
    expect(state.inserts).toContainEqual(expect.objectContaining({ table: auditEvents, values: expect.objectContaining({ action: 'payment.chain_exception' }) }))
  })

  it('quarantines a formerly confirmed payment whose receipt disappears', async () => {
    const state = fixture({ missingReceipt: true })
    const result = await reconcilePaymentObservation('observation')
    expect(result.status).toBe('needs_review')
    expect(state.payment.status).toBe('failed')
    expect(state.observation.status).toBe('needs_review')
  })

  it('retains a confirmed payment and schedules a retry when RPC is temporarily unavailable', async () => {
    const state = fixture({ rpcError: true })
    await expect(reconcilePaymentObservation('observation')).rejects.toThrow('RPC unavailable')
    expect(state.payment.status).toBe('confirmed')
    expect(state.observation.status).toBe('confirmed')
    expect(state.updates).toContainEqual(expect.objectContaining({ table: paymentObservations, values: expect.objectContaining({ lastError: 'RPC unavailable', nextAttemptAt: expect.any(Date) }) }))
  })

  it('runs a bounded due-worker batch and reports outcomes', async () => {
    fixture()
    expect(await reconcileDuePayments(1)).toEqual([{ id: 'observation', confirmations: 12, status: 'confirmed' }])
  })
})
