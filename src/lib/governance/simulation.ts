import {
  createPublicClient, decodeFunctionResult, encodeFunctionData, getAddress,
  http, keccak256, parseAbi, type Address, type PublicClient,
} from 'viem'
import { gnosis } from 'viem/chains'

import { canonicalSha256 } from '../immutable/canonical'
import {
  BAAL_CLONE_IMPLEMENTATION, expectedBaalCloneCode, MULTISEND_CODE_HASH,
  RAIDGUILD_BAAL, RAIDGUILD_MULTISEND, RAIDGUILD_SAFE, RAIDGUILD_SHARES,
  submitAbi, type EncodedProposal,
} from './baal-encoding'

const baalReadAbi = parseAbi([
  'function sharesToken() view returns (address)',
  'function avatar() view returns (address)',
  'function target() view returns (address)',
  'function multisendLibrary() view returns (address)',
  'function proposalOffering() view returns (uint256)',
  'function sponsorThreshold() view returns (uint256)',
  'function votingPeriod() view returns (uint32)',
  'function gracePeriod() view returns (uint32)',
  'function proposalCount() view returns (uint32)',
  'function hashOperation(bytes transactions) pure returns (bytes32)',
])
const sharesAbi = parseAbi(['function getVotes(address account) view returns (uint256)'])
const safeProxyAbi = parseAbi(['function masterCopy() view returns (address)'])
const safeAbi = parseAbi([
  'function isModuleEnabled(address module) view returns (bool)',
  'function execTransactionFromModuleReturnData(address to, uint256 value, bytes data, uint8 operation) returns (bool success, bytes returnData)',
])
// SafeProxy delegates to the address in slot 0; the deployed shares token
// proxy uses the EIP-1967 implementation slot. Both were verified from their
// deployed runtime bytecode and read-only Gnosis storage on 2026-11-23.
export const SAFE_MASTER_COPY = getAddress('0xd9db270c1b5e3bd161e8c8503c55ceabee709552')
export const SHARES_IMPLEMENTATION = getAddress('0x8124cbb807a7b64123f3dec3ef64995d8b10d3eb')
export const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const
export const EXECUTABLE_CODE_HASHES = {
  baalImplementation: '0xad108b1388fa856dd961908ec7a51eac4b8730f742190ea162d32de7c6a44e59',
  safeProxy: '0xb89c1b3bdf2cf8827818646bce9a8f6e372885f8c55e5c07acbd307cb133b000',
  safeMasterCopy: '0xbba688fbdb21ad2bb58bc320638b43d94e7d100f6f3ebaab0a4e4de6304b1c2e',
  sharesProxy: '0xadb4ff4c20a069b6ef2e5cbef51bcc2054eae5e153cf11adc5471022a6f0199f',
  sharesImplementation: '0xe160b6b6491ad5ad6735004dd4c3d2e0028dead5179630d5e338529902f20ffb',
} as const

export type ExecutableDependencyEvidence = {
  baalImplementationCodeHash: string;
  safeProxyCodeHash: string; safeMasterCopy: Address; safeMasterCopyCodeHash: string;
  sharesProxyCodeHash: string; sharesImplementation: Address; sharesImplementationCodeHash: string;
}

export function assertPinnedExecutableDependencies(evidence: ExecutableDependencyEvidence) {
  if (evidence.baalImplementationCodeHash !== EXECUTABLE_CODE_HASHES.baalImplementation ||
    evidence.safeProxyCodeHash !== EXECUTABLE_CODE_HASHES.safeProxy ||
    evidence.safeMasterCopy !== SAFE_MASTER_COPY ||
    evidence.safeMasterCopyCodeHash !== EXECUTABLE_CODE_HASHES.safeMasterCopy ||
    evidence.sharesProxyCodeHash !== EXECUTABLE_CODE_HASHES.sharesProxy ||
    evidence.sharesImplementation !== SHARES_IMPLEMENTATION ||
    evidence.sharesImplementationCodeHash !== EXECUTABLE_CODE_HASHES.sharesImplementation) {
    throw new Error('A deployed executable dependency or proxy implementation differs from the verified pin.')
  }
}

function implementationFromStorage(value: string | undefined, label: string): Address {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} implementation storage is missing or invalid.`)
  return getAddress(`0x${value.slice(-40)}`)
}
export const PINNED_GOVERNANCE_PARAMETERS = {
  proposalOffering: 1n * 10n ** 18n,
  sponsorThreshold: 100n * 10n ** 18n,
  votingPeriod: 259200,
  gracePeriod: 172800,
} as const

export function assertPinnedGovernanceParameters(input: {
  proposalOffering: bigint; sponsorThreshold: bigint; votingPeriod: number; gracePeriod: number
}) {
  if (input.proposalOffering !== PINNED_GOVERNANCE_PARAMETERS.proposalOffering ||
    input.sponsorThreshold !== PINNED_GOVERNANCE_PARAMETERS.sponsorThreshold ||
    input.votingPeriod !== PINNED_GOVERNANCE_PARAMETERS.votingPeriod ||
    input.gracePeriod !== PINNED_GOVERNANCE_PARAMETERS.gracePeriod) {
    throw new Error('Deployed governance parameters changed from the independently verified pin.')
  }
}

export type GovernanceConfigEvidence = {
  chainId: number; blockNumber: string; blockHash: string;
  dao: Address; safe: Address; shares: Address; multisend: Address;
  cloneImplementation: Address; multisendCodeHash: string;
  executableDependencies: ExecutableDependencyEvidence;
  proposalOffering: string; sponsorThreshold: string;
  votingPeriod: number; gracePeriod: number; proposalCount: number;
}

export type ProposalSimulation = {
  config: GovernanceConfigEvidence
  configHash: string
  submitter: Address
  delegatedVotesRaw: string
  autoSponsor: boolean
  proposalOfferingRaw: string
  requiredValueRaw: string
  actionSuccess: true
  submissionSuccess: true
  simulatedProposalId: string
  simulatedAt: string
  expiresAt: string
}

export function governanceClient(): PublicClient {
  return createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_CHAIN_RPC_URL ?? 'https://rpc.gnosischain.com') })
}

export function sponsorshipTerms(delegatedVotes: bigint, sponsorThreshold: bigint, proposalOffering: bigint) {
  const autoSponsor = delegatedVotes >= sponsorThreshold
  return { autoSponsor, requiredValue: autoSponsor ? 0n : proposalOffering }
}

export async function simulateBaalProposal(encoded: EncodedProposal, submitterInput: string, client: PublicClient = governanceClient()): Promise<ProposalSimulation> {
  const submitter = getAddress(submitterInput)
  const chainId = await client.getChainId()
  if (chainId !== 100) throw new Error('Proposal simulation RPC is not Gnosis Chain.')
  const head = await client.getBlockNumber()
  const confirmations = BigInt(process.env.GNOSIS_PROPOSAL_SIMULATION_CONFIRMATIONS ?? '2')
  if (confirmations < 0n || confirmations > 64n || head < confirmations) throw new Error('Invalid proposal simulation confirmation depth.')
  const blockNumber = head - confirmations
  const block = await client.getBlock({ blockNumber })
  if (!block.hash) throw new Error('Simulation block has no canonical hash.')

  const [cloneCode, baalImplementationCode, multisendCode, safeProxyCode, safeMasterCopyCode,
    sharesProxyCode, sharesImplementationCode, safeMasterCopyStorage, sharesImplementationStorage, safeMasterCopyCall,
    shares, avatar, target, multisend,
    proposalOffering, sponsorThreshold, votingPeriod, gracePeriod, proposalCount,
    moduleEnabled, operationHash, delegatedVotes] = await Promise.all([
    client.getBytecode({ address: RAIDGUILD_BAAL, blockNumber }),
    client.getBytecode({ address: BAAL_CLONE_IMPLEMENTATION, blockNumber }),
    client.getBytecode({ address: RAIDGUILD_MULTISEND, blockNumber }),
    client.getBytecode({ address: RAIDGUILD_SAFE, blockNumber }),
    client.getBytecode({ address: SAFE_MASTER_COPY, blockNumber }),
    client.getBytecode({ address: RAIDGUILD_SHARES, blockNumber }),
    client.getBytecode({ address: SHARES_IMPLEMENTATION, blockNumber }),
    client.getStorageAt({ address: RAIDGUILD_SAFE, slot: '0x0', blockNumber }),
    client.getStorageAt({ address: RAIDGUILD_SHARES, slot: EIP1967_IMPLEMENTATION_SLOT, blockNumber }),
    client.readContract({ abi: safeProxyAbi, address: RAIDGUILD_SAFE, functionName: 'masterCopy', blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'sharesToken', blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'avatar', blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'target', blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'multisendLibrary', blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'proposalOffering', blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'sponsorThreshold', blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'votingPeriod', blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'gracePeriod', blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'proposalCount', blockNumber }),
    client.readContract({ abi: safeAbi, address: RAIDGUILD_SAFE, functionName: 'isModuleEnabled', args: [RAIDGUILD_BAAL], blockNumber }),
    client.readContract({ abi: baalReadAbi, address: RAIDGUILD_BAAL, functionName: 'hashOperation', args: [encoded.proposalData], blockNumber }),
    client.readContract({ abi: sharesAbi, address: RAIDGUILD_SHARES, functionName: 'getVotes', args: [submitter], blockNumber }),
  ])
  if (!cloneCode || cloneCode.toLowerCase() !== expectedBaalCloneCode().toLowerCase()) throw new Error('Deployed Baal clone implementation changed.')
  if (!multisendCode || keccak256(multisendCode) !== MULTISEND_CODE_HASH) throw new Error('Deployed MultiSend code hash changed.')
  if (!baalImplementationCode || !safeProxyCode || !safeMasterCopyCode || !sharesProxyCode || !sharesImplementationCode) {
    throw new Error('An executable dependency has no deployed bytecode.')
  }
  const safeMasterCopy = implementationFromStorage(safeMasterCopyStorage, 'Safe master-copy')
  const sharesImplementation = implementationFromStorage(sharesImplementationStorage, 'Shares proxy')
  if (safeMasterCopy !== getAddress(safeMasterCopyCall)) throw new Error('Safe masterCopy() differs from the proxy storage slot.')
  const executableDependencies: ExecutableDependencyEvidence = {
    baalImplementationCodeHash: keccak256(baalImplementationCode),
    safeProxyCodeHash: keccak256(safeProxyCode), safeMasterCopy, safeMasterCopyCodeHash: keccak256(safeMasterCopyCode),
    sharesProxyCodeHash: keccak256(sharesProxyCode), sharesImplementation, sharesImplementationCodeHash: keccak256(sharesImplementationCode),
  }
  assertPinnedExecutableDependencies(executableDependencies)
  if (getAddress(shares) !== RAIDGUILD_SHARES || getAddress(avatar) !== RAIDGUILD_SAFE || getAddress(target) !== RAIDGUILD_SAFE ||
      getAddress(multisend) !== RAIDGUILD_MULTISEND || !moduleEnabled || operationHash !== encoded.proposalDataHash) {
    throw new Error('Deployed DAO, Safe module, or proposal operation hash differs from the pinned configuration.')
  }
  assertPinnedGovernanceParameters({ proposalOffering, sponsorThreshold, votingPeriod, gracePeriod })
  const config: GovernanceConfigEvidence = {
    chainId, blockNumber: blockNumber.toString(), blockHash: block.hash,
    dao: RAIDGUILD_BAAL, safe: RAIDGUILD_SAFE, shares: RAIDGUILD_SHARES, multisend: RAIDGUILD_MULTISEND,
    cloneImplementation: BAAL_CLONE_IMPLEMENTATION, multisendCodeHash: MULTISEND_CODE_HASH,
    executableDependencies,
    proposalOffering: proposalOffering.toString(), sponsorThreshold: sponsorThreshold.toString(),
    votingPeriod, gracePeriod, proposalCount,
  }
  const { autoSponsor, requiredValue } = sponsorshipTerms(delegatedVotes, sponsorThreshold, proposalOffering)

  // Simulate the actual Baal-module -> Safe -> delegatecall MultiSend path.
  // Safe returns an explicit boolean; a non-reverting eth_call is not enough.
  const actionCallData = encodeFunctionData({ abi: safeAbi, functionName: 'execTransactionFromModuleReturnData',
    args: [RAIDGUILD_MULTISEND, 0n, encoded.proposalData, 1] })
  const actionCall = await client.call({ account: RAIDGUILD_BAAL, to: RAIDGUILD_SAFE, data: actionCallData, blockNumber })
  if (!actionCall.data) throw new Error('Safe action simulation returned no data.')
  const [actionSuccess] = decodeFunctionResult({ abi: safeAbi, functionName: 'execTransactionFromModuleReturnData', data: actionCall.data })
  if (!actionSuccess) throw new Error('Safe action simulation explicitly failed.')

  const submitCall = await client.call({ account: submitter, to: RAIDGUILD_BAAL,
    data: encoded.submitCalldata, value: requiredValue, blockNumber })
  if (!submitCall.data) throw new Error('Proposal submission simulation returned no data.')
  const simulatedProposalId = decodeFunctionResult({ abi: submitAbi, functionName: 'submitProposal', data: submitCall.data })
  if (simulatedProposalId !== BigInt(proposalCount) + 1n) throw new Error('Proposal submission simulation returned an unexpected ID.')
  const simulatedAt = new Date()
  return {
    config, configHash: canonicalSha256(config), submitter,
    delegatedVotesRaw: delegatedVotes.toString(), autoSponsor,
    proposalOfferingRaw: proposalOffering.toString(), requiredValueRaw: requiredValue.toString(),
    actionSuccess: true, submissionSuccess: true,
    simulatedProposalId: simulatedProposalId.toString(),
    simulatedAt: simulatedAt.toISOString(), expiresAt: new Date(simulatedAt.getTime() + 5 * 60_000).toISOString(),
  }
}
