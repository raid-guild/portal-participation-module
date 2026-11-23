import {
  concatHex, decodeFunctionData, encodeAbiParameters, encodeFunctionData,
  getAddress, keccak256, parseAbi, size, sliceHex, toHex, type Address, type Hex,
} from 'viem'

import type { IssuancePayload } from '../issuance/build'

export const RAIDGUILD_BAAL = getAddress('0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986')
export const RAIDGUILD_SAFE = getAddress('0x181eBDB03cb4b54F4020622F1B0EAcd67A8C63aC')
export const RAIDGUILD_SHARES = getAddress('0x372fc5a6b0B12aE174F09f6Fc849A83dE6b503B6')
export const RAIDGUILD_MULTISEND = getAddress('0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761')
export const BAAL_CLONE_IMPLEMENTATION = getAddress('0x5dce1044a7e2e35d6524001796cee47252f18411')
export const MULTISEND_CODE_HASH = '0x0208282bd262360d0320862c5ac70f375f5ed3b9d89a83a615b4d398415bdc83' as Hex

export const mintAbi = parseAbi(['function mintShares(address[] to, uint256[] amount)'])
export const multisendAbi = parseAbi(['function multiSend(bytes transactions)'])
export const submitAbi = parseAbi(['function submitProposal(bytes proposalData, uint32 expiration, uint256 baalGas, string details) payable returns (uint256)'])

export type EncodedProposal = {
  dao: Address
  multisend: Address
  recipients: Address[]
  amountsRaw: string[]
  mintCalldata: Hex
  mintCalldataHash: Hex
  packedAction: Hex
  proposalData: Hex
  proposalDataHash: Hex
  submitCalldata: Hex
  submitCalldataHash: Hex
  details: string
}

export function proposalDetails(periodKey: string, revision: number, snapshotHash: string): string {
  return `RaidGuild participation ${periodKey} r${revision} · frozen ${snapshotHash}`
}

export function encodeBaalMintProposal(payload: IssuancePayload, revision: number, snapshotHash: string): EncodedProposal {
  if (payload.blockers.length || payload.included.length === 0) throw new Error('Frozen review has unresolved blockers or no recipients.')
  if (payload.policy.paymentBasis !== 'gross' || payload.policy.version.startsWith('proposed') ||
      payload.policy.sharePriceMinorUnits !== 250 || payload.policy.maxMonthlyMinorUnits !== 20000) {
    throw new Error('Frozen issuance rate, cap, or approved payment policy is invalid.')
  }
  if (getAddress(payload.membership.daoAddress) !== RAIDGUILD_BAAL || getAddress(payload.membership.sharesTokenAddress) !== RAIDGUILD_SHARES) {
    throw new Error('Frozen review targets a different DAO or shares token.')
  }
  const recipients = payload.included.map((line) => getAddress(line.recipientAddress))
  const amounts = payload.included.map((line) => BigInt(line.shareAmountRaw))
  if (payload.included.some((line, index) => !Number.isSafeInteger(line.amountMinorUnits) || line.amountMinorUnits <= 0 ||
      line.amountMinorUnits > 20000 || line.amountMinorUnits % 250 !== 0 ||
      amounts[index] !== BigInt(line.amountMinorUnits) * 10n ** 18n / 250n)) {
    throw new Error('Frozen amount does not match the approved $2.50 rate or $200 monthly cap.')
  }
  if (recipients.some((recipient) => recipient === '0x0000000000000000000000000000000000000000') ||
      new Set(recipients.map((recipient) => recipient.toLowerCase())).size !== recipients.length ||
      amounts.some((amount) => amount <= 0n || amount > 80n * 10n ** 18n)) {
    throw new Error('Frozen recipients or share quantities are invalid.')
  }
  const mintCalldata = encodeFunctionData({ abi: mintAbi, functionName: 'mintShares', args: [recipients, amounts] })
  const packedAction = concatHex([
    '0x00', RAIDGUILD_BAAL, toHex(0n, { size: 32 }), toHex(size(mintCalldata), { size: 32 }), mintCalldata,
  ])
  const proposalData = encodeFunctionData({ abi: multisendAbi, functionName: 'multiSend', args: [packedAction] })
  const proposalDataHash = keccak256(encodeAbiParameters([{ type: 'bytes' }], [proposalData]))
  const details = proposalDetails(payload.periodKey, revision, snapshotHash)
  const submitCalldata = encodeFunctionData({ abi: submitAbi, functionName: 'submitProposal', args: [proposalData, 0, 0n, details] })
  const encoded = { dao: RAIDGUILD_BAAL, multisend: RAIDGUILD_MULTISEND, recipients,
    amountsRaw: amounts.map((amount) => amount.toString()), mintCalldata, mintCalldataHash: keccak256(mintCalldata), packedAction,
    proposalData, proposalDataHash, submitCalldata, submitCalldataHash: keccak256(submitCalldata), details }
  verifyEncodedProposal(encoded, payload, revision, snapshotHash)
  return encoded
}

export function verifyEncodedProposal(encoded: EncodedProposal, payload: IssuancePayload, revision: number, snapshotHash: string) {
  if (getAddress(encoded.dao) !== RAIDGUILD_BAAL || getAddress(encoded.multisend) !== RAIDGUILD_MULTISEND) throw new Error('Proposal target mismatch.')
  const submit = decodeFunctionData({ abi: submitAbi, data: encoded.submitCalldata })
  if (submit.functionName !== 'submitProposal') throw new Error('Unexpected proposal selector.')
  const [proposalData, expiration, baalGas, details] = submit.args
  if (expiration !== 0 || baalGas !== 0n || details !== proposalDetails(payload.periodKey, revision, snapshotHash) || proposalData.toLowerCase() !== encoded.proposalData.toLowerCase()) throw new Error('Proposal wrapper mismatch.')
  const wrapper = decodeFunctionData({ abi: multisendAbi, data: proposalData })
  if (wrapper.functionName !== 'multiSend') throw new Error('Unexpected MultiSend selector.')
  const [packed] = wrapper.args
  if (packed.toLowerCase() !== encoded.packedAction.toLowerCase() || size(packed) < 85) throw new Error('Packed action mismatch.')
  if (encodeFunctionData({ abi: multisendAbi, functionName: 'multiSend', args: [packed] }).toLowerCase() !== proposalData.toLowerCase()) throw new Error('MultiSend wrapper is not canonical.')
  const operation = sliceHex(packed, 0, 1)
  const target = getAddress(sliceHex(packed, 1, 21))
  const value = BigInt(sliceHex(packed, 21, 53))
  const dataLength = Number(BigInt(sliceHex(packed, 53, 85)))
  if (operation !== '0x00' || target !== RAIDGUILD_BAAL || value !== 0n || size(packed) !== 85 + dataLength) throw new Error('Packed action is not one zero-value Baal CALL.')
  const mintData = sliceHex(packed, 85, 85 + dataLength)
  if (mintData.toLowerCase() !== encoded.mintCalldata.toLowerCase()) throw new Error('Mint calldata byte mismatch.')
  if (keccak256(mintData) !== encoded.mintCalldataHash) throw new Error('Mint calldata hash mismatch.')
  const mint = decodeFunctionData({ abi: mintAbi, data: mintData })
  if (mint.functionName !== 'mintShares') throw new Error('Unexpected mint selector.')
  const [recipients, amounts] = mint.args
  if (recipients.length !== payload.included.length || amounts.length !== payload.included.length) throw new Error('Mint array length mismatch.')
  if (encoded.recipients.length !== recipients.length || encoded.amountsRaw.length !== amounts.length) throw new Error('Displayed mint arrays differ from calldata.')
  for (let i = 0; i < recipients.length; i++) {
    if (getAddress(recipients[i]) !== getAddress(payload.included[i].recipientAddress) ||
      amounts[i] !== BigInt(payload.included[i].shareAmountRaw) ||
      getAddress(encoded.recipients[i]) !== getAddress(recipients[i]) ||
      BigInt(encoded.amountsRaw[i]) !== amounts[i]) throw new Error('Mint recipient or amount differs from frozen snapshot.')
  }
  if (keccak256(encodeAbiParameters([{ type: 'bytes' }], [proposalData])) !== encoded.proposalDataHash) throw new Error('Proposal operation hash mismatch.')
  const canonical = encodeFunctionData({ abi: submitAbi, functionName: 'submitProposal', args: [proposalData, 0, 0n, details] })
  if (canonical.toLowerCase() !== encoded.submitCalldata.toLowerCase()) throw new Error('Proposal calldata is not canonical.')
  if (keccak256(encoded.submitCalldata) !== encoded.submitCalldataHash) throw new Error('Proposal calldata hash mismatch.')
}

export function expectedBaalCloneCode(): Hex {
  return `0x363d3d373d3d3d363d73${BAAL_CLONE_IMPLEMENTATION.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3` as Hex
}
