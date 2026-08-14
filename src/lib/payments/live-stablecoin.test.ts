import { encodeFunctionData, parseAbi } from 'viem'
import { describe, expect, it } from 'vitest'

import { validateTransferCall } from './live-stablecoin'

const abi = parseAbi(['function transfer(address to, uint256 value) returns (bool)'])
const sender = '0x1111111111111111111111111111111111111111'
const token = '0x2222222222222222222222222222222222222222'
const treasury = '0x3333333333333333333333333333333333333333'
const data = encodeFunctionData({ abi, functionName: 'transfer', args: [treasury, 20n * 10n ** 18n] })

describe('live wxDAI transfer validation', () => {
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
