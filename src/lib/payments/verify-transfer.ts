import { decodeFunctionData, getAddress, isAddress, parseAbi, type Hash } from 'viem'

const transferAbi = parseAbi(['function transfer(address to, uint256 value) returns (bool)'])
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export type TransferEvidence = {
  amountAtomic: string
  chainId: number
  expectedSender: string
  expiresAt: Date
  createdAt: Date
  recipient: string
  tokenAddress: string
}

export type ChainReader = {
  getChainId(): Promise<number>
  getTransaction(args: { hash: Hash }): Promise<{
    from: `0x${string}`; to: `0x${string}` | null; input: `0x${string}`;
    value: bigint; blockHash?: Hash | null
  }>
  getTransactionReceipt(args: { hash: Hash }): Promise<{
    status: string; blockNumber: bigint; blockHash: Hash;
    logs: readonly { address: `0x${string}`; topics: readonly (Hash | undefined)[]; data: `0x${string}` }[]
  }>
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint; hash: Hash }>
  getBlockNumber(): Promise<bigint>
}

export class TransferEvidenceError extends Error {}

export type TransferVerification =
  | { status: 'pending'; confirmations: 0 }
  | { status: 'confirming' | 'confirmed'; confirmations: number; blockNumber: bigint; blockHash: Hash; minedAt: Date }

export async function verifyDirectWxDaiTransfer(
  reader: ChainReader,
  hash: Hash,
  intent: TransferEvidence,
  requiredConfirmations: number,
): Promise<TransferVerification> {
  const chainId = await reader.getChainId()
  if (chainId !== intent.chainId) throw new TransferEvidenceError('RPC chain does not match the payment intent.')

  let transaction: Awaited<ReturnType<ChainReader['getTransaction']>>
  let receipt: Awaited<ReturnType<ChainReader['getTransactionReceipt']>>
  try {
    ;[transaction, receipt] = await Promise.all([
      reader.getTransaction({ hash }),
      reader.getTransactionReceipt({ hash }),
    ])
  } catch (error) {
    if (isNotFoundError(error)) return { status: 'pending', confirmations: 0 }
    throw error
  }
  if (receipt.status !== 'success') throw new TransferEvidenceError('Transaction execution failed.')
  if (transaction.value !== 0n) throw new TransferEvidenceError('Native xDAI is not an accepted wxDAI payment.')
  validateTransferCall({
    expectedAmountAtomic: intent.amountAtomic,
    expectedRecipient: intent.recipient,
    expectedSender: intent.expectedSender,
    expectedToken: intent.tokenAddress,
    from: transaction.from,
    input: transaction.input,
    to: transaction.to,
  })

  const expectedSender = getAddress(intent.expectedSender)
  const expectedRecipient = getAddress(intent.recipient)
  const expectedToken = getAddress(intent.tokenAddress)
  const matchingLog = receipt.logs.some((log) => {
    const from = topicAddress(log.topics[1])
    const to = topicAddress(log.topics[2])
    return log.topics[0]?.toLowerCase() === transferTopic &&
      getAddress(log.address) === expectedToken && from === expectedSender && to === expectedRecipient &&
      BigInt(log.data).toString() === intent.amountAtomic
  })
  if (!matchingLog) throw new TransferEvidenceError('Transaction has no matching wxDAI Transfer event.')

  const block = await reader.getBlock({ blockNumber: receipt.blockNumber })
  if (block.hash.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      (transaction.blockHash && transaction.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase())) {
    throw new TransferEvidenceError('Transaction block evidence changed; review for a reorganization.')
  }
  const minedAt = new Date(Number(block.timestamp) * 1000)
  const minedSecond = Number(block.timestamp)
  const startSecond = Math.floor(intent.createdAt.getTime() / 1000)
  const endSecond = Math.floor(intent.expiresAt.getTime() / 1000)
  if (minedSecond < startSecond || minedSecond > endSecond) {
    throw new TransferEvidenceError('Transaction was mined outside the payment-intent window.')
  }
  const head = await reader.getBlockNumber()
  if (head < receipt.blockNumber) throw new TransferEvidenceError('RPC head is behind the payment block.')
  const confirmations = Number(head - receipt.blockNumber + 1n)
  return {
    status: confirmations >= requiredConfirmations ? 'confirmed' : 'confirming',
    confirmations,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    minedAt,
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'TransactionNotFoundError' || error.name === 'TransactionReceiptNotFoundError') return true
  return /(?:transaction|receipt).{0,60}not found|not indexed/i.test(error.message)
}

function topicAddress(topic: Hash | undefined): string | null {
  if (!topic || topic.length !== 66) return null
  const address = `0x${topic.slice(-40)}`
  return isAddress(address) ? getAddress(address) : null
}

export function validateTransferCall(input: {
  expectedAmountAtomic: string
  expectedRecipient: string
  expectedSender: string
  expectedToken: string
  from: `0x${string}`
  input: `0x${string}`
  to: `0x${string}` | null
}) {
  if (!input.to || getAddress(input.to) !== getAddress(input.expectedToken)) {
    throw new TransferEvidenceError('Transaction did not call the configured wxDAI token.')
  }
  if (getAddress(input.from) !== getAddress(input.expectedSender)) {
    throw new TransferEvidenceError('Transaction sender does not match the verified Portal wallet.')
  }
  let decoded
  try {
    decoded = decodeFunctionData({ abi: transferAbi, data: input.input })
  } catch {
    throw new TransferEvidenceError('Transaction is not a wxDAI transfer.')
  }
  if (decoded.functionName !== 'transfer') throw new TransferEvidenceError('Transaction is not a wxDAI transfer.')
  const [recipient, amount] = decoded.args
  if (getAddress(recipient) !== getAddress(input.expectedRecipient)) {
    throw new TransferEvidenceError('Transfer recipient does not match the RaidGuild treasury.')
  }
  if (amount.toString() !== input.expectedAmountAtomic) {
    throw new TransferEvidenceError('Transfer amount does not match the payment intent.')
  }
}
