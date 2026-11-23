import { encodeFunctionData, parseAbi } from 'viem'
import { describe, expect, it } from 'vitest'

import { deriveCapabilities } from '../domain/participation'
import { validateTransferCall, verifyDirectWxDaiTransfer, type ChainReader } from './verify-transfer'

const abi = parseAbi(['function transfer(address to, uint256 value) returns (bool)'])
const sender = '0x1111111111111111111111111111111111111111' as const
const token = '0x2222222222222222222222222222222222222222' as const
const treasury = '0x3333333333333333333333333333333333333333' as const
const amount = 20n * 10n ** 18n
const hash = `0x${'a1'.repeat(32)}` as `0x${string}`
const blockHash = `0x${'bb'.repeat(32)}` as `0x${string}`
const data = encodeFunctionData({ abi, functionName: 'transfer', args: [treasury, amount] })
const topicAddress = (address: string) => `0x${'0'.repeat(24)}${address.slice(2)}` as `0x${string}`
const intent = {
  amountAtomic: amount.toString(), chainId: 100,
  createdAt: new Date('2026-11-18T02:00:00Z'), expiresAt: new Date('2026-11-18T03:00:00Z'),
  expectedSender: sender, recipient: treasury, tokenAddress: token,
}
const transaction: Awaited<ReturnType<ChainReader['getTransaction']>> = { from: sender, to: token, input: data, value: 0n, blockHash }
const receipt: Awaited<ReturnType<ChainReader['getTransactionReceipt']>> = {
  status: 'success', blockNumber: 100n, blockHash,
  logs: [{ address: token, topics: [
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const,
    topicAddress(sender), topicAddress(treasury),
  ], data: `0x${amount.toString(16)}` as `0x${string}` }],
}
function reader(overrides: Partial<{
  chainId: number; transaction: typeof transaction; receipt: typeof receipt; timestamp: bigint; head: bigint
}> = {}): ChainReader {
  return {
    getChainId: async () => overrides.chainId ?? 100,
    getTransaction: async () => overrides.transaction ?? transaction,
    getTransactionReceipt: async () => overrides.receipt ?? receipt,
    getBlock: async () => ({ timestamp: overrides.timestamp ?? BigInt(Date.parse('2026-11-18T02:27:10Z') / 1000), hash: blockHash }),
    getBlockNumber: async () => overrides.head ?? 111n,
  }
}

describe('live wxDAI transfer validation', () => {
  const valid = {
    expectedAmountAtomic: amount.toString(), expectedRecipient: treasury,
    expectedSender: sender, expectedToken: token,
    from: sender, input: data, to: token,
  } as const

  it('accepts exact direct-transfer calldata and rejects mismatches', () => {
    expect(() => validateTransferCall(valid)).not.toThrow()
    expect(() => validateTransferCall({ ...valid, from: treasury })).toThrow('sender')
    expect(() => validateTransferCall({ ...valid, to: treasury })).toThrow('token')
    expect(() => validateTransferCall({ ...valid, expectedAmountAtomic: '1' })).toThrow('amount')
  })

  it('waits for confirmations then verifies a valid transfer', async () => {
    expect(await verifyDirectWxDaiTransfer(reader({ head: 110n }), hash, intent, 12))
      .toMatchObject({ status: 'confirming', confirmations: 11 })
    expect(await verifyDirectWxDaiTransfer(reader(), hash, intent, 12))
      .toMatchObject({ status: 'confirmed', confirmations: 12, blockHash })
  })

  it('returns pending when the transaction is not yet indexed and accepts a mined-in-window transfer after intent expiry', async () => {
    const pendingReader = { ...reader(), getTransactionReceipt: async () => { throw new Error('transaction receipt not found') } }
    expect(await verifyDirectWxDaiTransfer(pendingReader, hash, intent, 12))
      .toEqual({ status: 'pending', confirmations: 0 })
    const alreadyExpired = { ...intent, expiresAt: new Date('2026-11-18T02:30:00Z') }
    expect(await verifyDirectWxDaiTransfer(reader(), hash, alreadyExpired, 12))
      .toMatchObject({ status: 'confirmed' })
  })

  it('propagates RPC transport errors so the worker retries instead of treating them as a missing receipt', async () => {
    const unavailable = { ...reader(), getTransactionReceipt: async () => { throw new Error('RPC timeout') } }
    await expect(verifyDirectWxDaiTransfer(unavailable, hash, intent, 12)).rejects.toThrow('RPC timeout')
  })

  it('accepts a transfer mined in the same second as subsecond intent creation', async () => {
    const sameSecond = {
      ...intent,
      createdAt: new Date('2026-11-18T02:27:10.900Z'),
      expiresAt: new Date('2026-11-18T02:27:10.999Z'),
    }
    expect(await verifyDirectWxDaiTransfer(reader(), hash, sameSecond, 12))
      .toMatchObject({ status: 'confirmed' })
  })

  it('rejects native xDAI, wrong chain, missing transfer log, and pre-intent blocks', async () => {
    await expect(verifyDirectWxDaiTransfer(reader({ transaction: { ...transaction, to: treasury, value: amount } }), hash, intent, 12))
      .rejects.toThrow('Native xDAI')
    await expect(verifyDirectWxDaiTransfer(reader({ chainId: 1 }), hash, intent, 12))
      .rejects.toThrow('RPC chain')
    await expect(verifyDirectWxDaiTransfer(reader({ receipt: { ...receipt, logs: [] } }), hash, intent, 12))
      .rejects.toThrow('Transfer event')
    await expect(verifyDirectWxDaiTransfer(reader({ timestamp: BigInt(Date.parse('2026-11-18T01:59:59Z') / 1000) }), hash, intent, 12))
      .rejects.toThrow('outside')
  })

  it('keeps free cohort capabilities independent of payment', () => {
    expect(deriveCapabilities({ billingStatus: 'active', credentials: ['cohort_grad'] }))
      .not.toContain('shares.subscription_eligible')
  })
})
