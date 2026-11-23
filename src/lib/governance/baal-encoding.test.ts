import { describe, expect, it } from 'vitest'
import { concatHex, encodeFunctionData, getAddress, toHex } from 'viem'

import type { IssuancePayload } from '../issuance/build'
import { canonicalSha256 } from '../immutable/canonical'
import { encodeBaalMintProposal, mintAbi, multisendAbi, RAIDGUILD_BAAL, RAIDGUILD_SHARES, submitAbi, verifyEncodedProposal } from './baal-encoding'

const recipient = getAddress('0x1111111111111111111111111111111111111111')
const hash = 'abcd'.repeat(16)
const payload = {
  schemaVersion: 1, periodKey: '2026-10', cutoffAt: '2026-11-01T00:00:00.000Z',
  membership: { id: 'run', chainId: 100, daoAddress: RAIDGUILD_BAAL, sharesTokenAddress: RAIDGUILD_SHARES,
    cutoffBlockNumber: '49300000', cutoffBlockHash: `0x${'aa'.repeat(32)}`, thresholdRaw: (100n * 10n ** 18n).toString(), tokenDecimals: 18 },
  policy: { version: 'dao-approved-v1', paymentBasis: 'gross', sharePriceMinorUnits: 250, maxMonthlyMinorUnits: 20000 },
  included: [{ userId: 'user', recipientAddress: recipient, paymentIds: ['payment'], amountMinorUnits: 2000, shareAmountRaw: (8n * 10n ** 18n).toString() }],
  excluded: [], blockers: [],
} as IssuancePayload

describe('Baal proposal encoding from frozen content', () => {
  it('encodes deterministic single-action mint and round-trips every layer', () => {
    const first = encodeBaalMintProposal(payload, 1, hash)
    const second = encodeBaalMintProposal(payload, 1, hash)
    expect(first).toEqual(second)
    expect(first.packedAction.slice(0, 4)).toBe('0x00')
    expect(first.recipients).toEqual([recipient])
    expect(() => verifyEncodedProposal(first, payload, 1, hash)).not.toThrow()
  })

  it('rejects wrong target, selector, recipient, amount, and hidden extra action', () => {
    const encoded = encodeBaalMintProposal(payload, 1, hash)
    expect(() => verifyEncodedProposal({ ...encoded, dao: recipient }, payload, 1, hash)).toThrow()
    expect(() => verifyEncodedProposal({ ...encoded, submitCalldata: encoded.mintCalldata }, payload, 1, hash)).toThrow()
    expect(() => verifyEncodedProposal({ ...encoded, recipients: [RAIDGUILD_BAAL] }, payload, 1, hash)).toThrow()
    expect(() => verifyEncodedProposal({ ...encoded, amountsRaw: ['1'] }, payload, 1, hash)).toThrow()
    const wrongMint = encodeFunctionData({ abi: mintAbi, functionName: 'mintShares', args: [[recipient], [1n]] })
    expect(() => verifyEncodedProposal({ ...encoded, mintCalldata: wrongMint }, payload, 1, hash)).toThrow()
    const extraPacked = concatHex([encoded.packedAction, '0x00', RAIDGUILD_BAAL, toHex(0n, { size: 32 }), toHex(0n, { size: 32 })])
    const extraData = encodeFunctionData({ abi: multisendAbi, functionName: 'multiSend', args: [extraPacked] })
    const extraSubmit = encodeFunctionData({ abi: submitAbi, functionName: 'submitProposal', args: [extraData, 0, 0n, encoded.details] })
    expect(() => verifyEncodedProposal({ ...encoded, packedAction: extraPacked, proposalData: extraData, submitCalldata: extraSubmit }, payload, 1, hash)).toThrow()
  })

  it('fails closed on different DAO, token, blockers, or >80 shares', () => {
    expect(() => encodeBaalMintProposal({ ...payload, membership: { ...payload.membership, daoAddress: recipient } }, 1, hash)).toThrow()
    expect(() => encodeBaalMintProposal({ ...payload, membership: { ...payload.membership, sharesTokenAddress: recipient } }, 1, hash)).toThrow()
    expect(() => encodeBaalMintProposal({ ...payload, blockers: ['unresolved'] }, 1, hash)).toThrow()
    expect(() => encodeBaalMintProposal({ ...payload, included: [{ ...payload.included[0], shareAmountRaw: (81n * 10n ** 18n).toString() }] }, 1, hash)).toThrow()
    expect(() => encodeBaalMintProposal({ ...payload, included: [{ ...payload.included[0], shareAmountRaw: (7n * 10n ** 18n).toString() }] }, 1, hash)).toThrow('rate')
  })

  it('never changes mint calldata based on participation metrics and hashes exact bytes', () => {
    const encoded = encodeBaalMintProposal(payload, 1, hash)
    const withMetrics = { ...payload, prismMetrics: [{ score: 999, wallet: recipient }] } as IssuancePayload
    expect(encodeBaalMintProposal(withMetrics, 1, hash).submitCalldata).toBe(encoded.submitCalldata)
    expect(() => verifyEncodedProposal({ ...encoded, submitCalldataHash: `0x${'00'.repeat(32)}` }, payload, 1, hash)).toThrow('hash mismatch')
    expect(canonicalSha256({ encoded })).not.toBe(canonicalSha256({ encoded: { ...encoded, submitCalldataHash: `0x${'00'.repeat(32)}` } }))
  })
})
