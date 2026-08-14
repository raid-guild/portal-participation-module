import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type PublicClient,
} from 'viem'
import { gnosis } from 'viem/chains'

import { getDatabase } from '../db/client'
import {
  auditEvents,
  daoMembershipRuns,
  daoMembershipSnapshots,
  walletLinks,
} from '../db/schema'

export const GNOSIS_CHAIN_ID = 100
export const DEFAULT_DAO_ADDRESS = '0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986'
export const DEFAULT_SHARES_TOKEN_ADDRESS = '0x372fc5a6b0B12aE174F09f6Fc849A83dE6b503B6'
export const MEMBERSHIP_THRESHOLD_SHARES = 100n

const baalAbi = parseAbi(['function sharesToken() view returns (address)'])
const erc20Abi = parseAbi([
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
])

export type MembershipConfig = {
  confirmations: bigint
  daoAddress: Address
  rpcUrl: string
  sharesTokenAddress: Address
  thresholdShares: bigint
}

export function getMembershipConfig(): MembershipConfig {
  const confirmations = BigInt(process.env.GNOSIS_MEMBERSHIP_CONFIRMATIONS ?? '12')
  const thresholdShares = BigInt(process.env.RG_MEMBERSHIP_THRESHOLD ?? '100')
  if (confirmations < 0n) throw new Error('GNOSIS_MEMBERSHIP_CONFIRMATIONS cannot be negative.')
  if (thresholdShares < 1n) throw new Error('RG_MEMBERSHIP_THRESHOLD must be positive.')

  return {
    confirmations,
    daoAddress: getAddress(process.env.GNOSIS_DAO_ADDRESS ?? DEFAULT_DAO_ADDRESS),
    rpcUrl: process.env.GNOSIS_CHAIN_RPC_URL ?? 'https://rpc.gnosischain.com',
    sharesTokenAddress: getAddress(
      process.env.GNOSIS_RG_SHARES_ADDRESS ?? DEFAULT_SHARES_TOKEN_ADDRESS,
    ),
    thresholdShares,
  }
}

export function isCanonicalMember(balanceRaw: bigint, thresholdRaw: bigint): boolean {
  return balanceRaw >= thresholdRaw
}

export async function refreshDaoMembership(
  initiatedBy: string,
  dependencies?: { client?: PublicClient },
) {
  const config = getMembershipConfig()
  const database = getDatabase()
  const thresholdRaw = parseUnits(config.thresholdShares.toString(), 18)
  const [run] = await database
    .insert(daoMembershipRuns)
    .values({
      chainId: GNOSIS_CHAIN_ID,
      daoAddress: config.daoAddress,
      initiatedBy,
      sharesTokenAddress: config.sharesTokenAddress,
      thresholdRaw: thresholdRaw.toString(),
    })
    .returning({ id: daoMembershipRuns.id })

  try {
    const client =
      dependencies?.client ?? createPublicClient({ chain: gnosis, transport: http(config.rpcUrl) })
    const head = await client.getBlockNumber()
    if (head < config.confirmations) throw new Error('Gnosis head is below the confirmation depth.')
    const cutoffBlockNumber = head - config.confirmations
    const block = await client.getBlock({ blockNumber: cutoffBlockNumber })
    const [contractSharesToken, tokenDecimals] = await Promise.all([
      client.readContract({
        abi: baalAbi,
        address: config.daoAddress,
        blockNumber: cutoffBlockNumber,
        functionName: 'sharesToken',
      }),
      client.readContract({
        abi: erc20Abi,
        address: config.sharesTokenAddress,
        blockNumber: cutoffBlockNumber,
        functionName: 'decimals',
      }),
    ])

    if (getAddress(contractSharesToken) !== config.sharesTokenAddress) {
      throw new Error('DAO sharesToken does not match the configured RG token.')
    }
    if (tokenDecimals !== 18) {
      throw new Error(`RG token decimals mismatch: expected 18, received ${tokenDecimals}.`)
    }

    const wallets = await database
      .select({
        address: walletLinks.address,
        id: walletLinks.id,
        userId: walletLinks.userId,
      })
      .from(walletLinks)
      .where(
        and(
          eq(walletLinks.chainId, GNOSIS_CHAIN_ID),
          isNull(walletLinks.revokedAt),
        ),
      )

    const balances = await Promise.all(
      wallets.map(async (wallet) => ({
        ...wallet,
        balanceRaw: await client.readContract({
          abi: erc20Abi,
          address: config.sharesTokenAddress,
          args: [getAddress(wallet.address)],
          blockNumber: cutoffBlockNumber,
          functionName: 'balanceOf',
        }),
      })),
    )

    const completedAt = new Date()
    const eligibleCount = new Set(
      balances.filter((item) => isCanonicalMember(item.balanceRaw, thresholdRaw)).map((item) => item.userId),
    ).size

    await database.transaction(async (transaction) => {
      if (balances.length) {
        await transaction.insert(daoMembershipSnapshots).values(
          balances.map((item) => ({
            eligible: isCanonicalMember(item.balanceRaw, thresholdRaw),
            runId: run.id,
            shareBalanceRaw: item.balanceRaw.toString(),
            userId: item.userId,
            walletAddress: getAddress(item.address),
            walletLinkId: item.id,
          })),
        )
      }
      await transaction
        .update(daoMembershipRuns)
        .set({
          completedAt,
          cutoffBlockHash: block.hash,
          cutoffBlockNumber,
          eligibleCount,
          status: 'succeeded',
          tokenDecimals,
          walletCount: balances.length,
        })
        .where(eq(daoMembershipRuns.id, run.id))
      await transaction.insert(auditEvents).values({
        action: 'dao_membership.refresh_succeeded',
        actorId: initiatedBy,
        actorType: initiatedBy.startsWith('portal:') ? 'portal_user' : 'service',
        details: {
          blockHash: block.hash,
          blockNumber: cutoffBlockNumber.toString(),
          eligibleCount,
          walletCount: balances.length,
        },
        entityId: run.id,
        entityType: 'dao_membership_run',
      })
    })

    return {
      blockHash: block.hash,
      blockNumber: cutoffBlockNumber,
      eligibleCount,
      runId: run.id,
      walletCount: balances.length,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown membership refresh error.'
    await database
      .update(daoMembershipRuns)
      .set({ completedAt: new Date(), error: message.slice(0, 2_000), status: 'failed' })
      .where(eq(daoMembershipRuns.id, run.id))
    throw error
  }
}

export async function getLatestSuccessfulMembershipRun() {
  const [run] = await getDatabase()
    .select()
    .from(daoMembershipRuns)
    .where(eq(daoMembershipRuns.status, 'succeeded'))
    .orderBy(desc(daoMembershipRuns.createdAt))
    .limit(1)
  return run ?? null
}
