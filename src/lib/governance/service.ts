import { and, desc, eq, sql } from 'drizzle-orm'
import { getAddress, type Address } from 'viem'

import { getDatabase } from '../db/client'
import {
  appRoleAssignments, auditEvents, issuanceProposalArtifacts, issuanceProposalDecisions, issuanceReviewSnapshots,
} from '../db/schema'
import { canonicalSha256 } from '../immutable/canonical'
import { issuancePayloadHash, type IssuancePayload } from '../issuance/build'
import { getIssuanceReview, getIssuanceReviewInTransaction } from '../issuance/service'
import { encodeBaalMintProposal, verifyEncodedProposal, type EncodedProposal } from './baal-encoding'
import { assertPinnedExecutableDependencies, assertPinnedGovernanceParameters, governanceClient, simulateBaalProposal, type ProposalSimulation } from './simulation'

export class GovernancePreparationError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}

export function assertIndependentProposalReviewer(builderUserId: string, reviewerUserId: string) {
  if (builderUserId === reviewerUserId) throw new GovernancePreparationError('Proposal builder cannot approve their own simulation.', 403)
}

export type ProposalArtifactPayload = {
  schemaVersion: 1
  snapshotId: string
  snapshotSha256: string
  revision: number
  encoded: EncodedProposal
  simulation: ProposalSimulation
}
type ProposalRecord = typeof issuanceProposalArtifacts.$inferSelect
type IssuanceReviewState = Awaited<ReturnType<typeof getIssuanceReview>>

function verifyStoredArtifact(record: ProposalRecord, review: IssuanceReviewState): ProposalArtifactPayload {
  const payload = record.artifact as ProposalArtifactPayload
  if (canonicalSha256(payload) !== record.artifactSha256 || payload.snapshotSha256 !== record.snapshotSha256) throw new GovernancePreparationError('Stored proposal artifact hash is invalid.')
  const frozen = review.snapshot.payload as IssuancePayload
  if (issuancePayloadHash(frozen) !== review.snapshot.payloadSha256 || payload.snapshotId !== record.snapshotId ||
    payload.revision !== review.snapshot.revision || payload.simulation.submitter !== record.submitterAddress ||
    payload.simulation.configHash !== canonicalSha256(payload.simulation.config) ||
    payload.simulation.config.chainId !== 100 || !payload.simulation.actionSuccess || !payload.simulation.submissionSuccess ||
    payload.simulation.expiresAt !== record.expiresAt.toISOString()) throw new GovernancePreparationError('Stored proposal or simulation evidence is inconsistent.')
  assertPinnedExecutableDependencies(payload.simulation.config.executableDependencies)
  assertPinnedGovernanceParameters({
    proposalOffering: BigInt(payload.simulation.config.proposalOffering),
    sponsorThreshold: BigInt(payload.simulation.config.sponsorThreshold),
    votingPeriod: payload.simulation.config.votingPeriod,
    gracePeriod: payload.simulation.config.gracePeriod,
  })
  verifyEncodedProposal(payload.encoded, frozen, review.snapshot.revision, review.snapshot.payloadSha256)
  return payload
}

async function requireCurrentAdmin(userId: string) {
  const database = getDatabase()
  const [role] = await database.select({ id: appRoleAssignments.id }).from(appRoleAssignments).where(and(
    eq(appRoleAssignments.userId, userId), eq(appRoleAssignments.role, 'app_admin'),
  )).limit(1)
  if (!role) throw new GovernancePreparationError('Current app-admin role required.', 403)
}

async function readySnapshot(snapshotId: string) {
  const review = await getIssuanceReview(snapshotId)
  const { snapshot, decisions, stale, latest } = review
  const payload = snapshot.payload as IssuancePayload
  if (issuancePayloadHash(payload) !== snapshot.payloadSha256) throw new GovernancePreparationError('Frozen issuance content hash is invalid.')
  if (!latest || stale || payload.blockers.length || payload.included.length === 0) throw new GovernancePreparationError('Frozen issuance review is stale, superseded, or blocked.')
  if (!decisions.some((decision) => decision.decision === 'approved' && decision.payloadSha256 === snapshot.payloadSha256)) {
    throw new GovernancePreparationError('Exact frozen issuance hash has not been independently approved.')
  }
  return { snapshot, payload }
}

export async function buildProposalArtifact(snapshotId: string, builderUserId: string, submitterInput: string) {
  await requireCurrentAdmin(builderUserId)
  let submitter: Address
  try { submitter = getAddress(submitterInput) }
  catch { throw new GovernancePreparationError('A valid connected submitter address is required.', 400) }
  const { snapshot, payload } = await readySnapshot(snapshotId)
  const encoded = encodeBaalMintProposal(payload, snapshot.revision, snapshot.payloadSha256)
  const simulation = await simulateBaalProposal(encoded, submitter)
  // Chain simulation can take time. Recheck live evidence before persisting the artifact.
  await readySnapshot(snapshotId)
  const artifact: ProposalArtifactPayload = {
    schemaVersion: 1, snapshotId, snapshotSha256: snapshot.payloadSha256,
    revision: snapshot.revision, encoded, simulation,
  }
  const artifactSha256 = canonicalSha256(artifact)
  const database = getDatabase()
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${snapshotId}), 91845)`)
    const [role] = await transaction.select({ id: appRoleAssignments.id }).from(appRoleAssignments).where(and(
      eq(appRoleAssignments.userId, builderUserId), eq(appRoleAssignments.role, 'app_admin'),
    )).limit(1)
    if (!role) throw new GovernancePreparationError('Current app-admin role required.', 403)
    const [existing] = await transaction.select().from(issuanceProposalArtifacts).where(eq(issuanceProposalArtifacts.artifactSha256, artifactSha256)).limit(1)
    if (existing) return existing
    const [record] = await transaction.insert(issuanceProposalArtifacts).values({
      snapshotId, snapshotSha256: snapshot.payloadSha256, artifactSha256,
      builderUserId, submitterAddress: submitter,
      artifact, expiresAt: new Date(simulation.expiresAt),
    }).returning()
    await transaction.insert(auditEvents).values({
      action: 'issuance_proposal.simulated', actorType: 'portal_user', actorId: builderUserId,
      entityType: 'issuance_proposal_artifact', entityId: record.id,
      details: { artifactSha256, snapshotSha256: snapshot.payloadSha256, blockNumber: simulation.config.blockNumber, submitter, autoSponsor: simulation.autoSponsor },
    })
    return record
  })
}

export async function getProposalArtifact(artifactId: string) {
  const database = getDatabase()
  const [record] = await database.select().from(issuanceProposalArtifacts).where(eq(issuanceProposalArtifacts.id, artifactId)).limit(1)
  if (!record) throw new GovernancePreparationError('Proposal artifact not found.', 404)
  const [latest] = await database.select().from(issuanceProposalArtifacts).where(eq(issuanceProposalArtifacts.snapshotId, record.snapshotId))
    .orderBy(desc(issuanceProposalArtifacts.createdAt)).limit(1)
  const [decision] = await database.select().from(issuanceProposalDecisions).where(eq(issuanceProposalDecisions.artifactId, artifactId)).limit(1)
  const review = await getIssuanceReview(record.snapshotId)
  verifyStoredArtifact(record, review)
  const frozen = review.snapshot.payload as IssuancePayload
  const expired = record.expiresAt <= new Date()
  const issuanceApproved = review.decisions.some((item) => item.decision === 'approved' && item.payloadSha256 === record.snapshotSha256)
  const ready = review.latest && !review.stale && latest?.id === record.id && !expired &&
    issuanceApproved && frozen.blockers.length === 0 &&
    decision?.decision === 'approved' && decision.artifactSha256 === record.artifactSha256
  return { record, decision: decision ?? null, review, expired, latest: latest?.id === record.id, ready }
}

export async function decideProposalArtifact(artifactId: string, reviewerUserId: string, decision: 'approved' | 'rejected', note: string) {
  const database = getDatabase()
  return database.transaction(async (transaction) => {
    // The snapshot is immutable; this first read only resolves the period lock
    // key. Every eligibility check is repeated after acquiring the same lock
    // that freezeIssuanceReview uses for that UTC period.
    const [initial] = await transaction.select().from(issuanceProposalArtifacts).where(eq(issuanceProposalArtifacts.id, artifactId)).limit(1)
    if (!initial) throw new GovernancePreparationError('Proposal artifact not found.', 404)
    const [source] = await transaction.select({ periodKey: issuanceReviewSnapshots.periodKey }).from(issuanceReviewSnapshots)
      .where(eq(issuanceReviewSnapshots.id, initial.snapshotId)).limit(1)
    if (!source) throw new GovernancePreparationError('Frozen issuance review not found.', 404)
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${source.periodKey}), 91843)`)
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${artifactId}), 91846)`)
    const [artifact] = await transaction.select().from(issuanceProposalArtifacts).where(eq(issuanceProposalArtifacts.id, artifactId)).limit(1)
    if (!artifact) throw new GovernancePreparationError('Proposal artifact not found.', 404)
    const review = await getIssuanceReviewInTransaction(transaction, artifact.snapshotId)
    verifyStoredArtifact(artifact, review)
    const frozen = review.snapshot.payload as IssuancePayload
    const [latestArtifact] = await transaction.select({ id: issuanceProposalArtifacts.id }).from(issuanceProposalArtifacts)
      .where(eq(issuanceProposalArtifacts.snapshotId, artifact.snapshotId))
      .orderBy(desc(issuanceProposalArtifacts.createdAt)).limit(1)
    assertIndependentProposalReviewer(artifact.builderUserId, reviewerUserId)
    if (!review.latest || review.stale || frozen.blockers.length || latestArtifact?.id !== artifact.id ||
      !review.decisions.some((item) => item.decision === 'approved' && item.payloadSha256 === artifact.snapshotSha256)) {
      throw new GovernancePreparationError('Proposal artifact or frozen evidence is stale, blocked, unapproved, or superseded.')
    }
    if (decision === 'approved' && artifact.expiresAt <= new Date()) throw new GovernancePreparationError('Simulation expired; build and simulate a new artifact.')
    const [existing] = await transaction.select().from(issuanceProposalDecisions).where(eq(issuanceProposalDecisions.artifactId, artifactId)).limit(1)
    if (existing) throw new GovernancePreparationError('This proposal artifact already has a decision.')
    const [role] = await transaction.select({ id: appRoleAssignments.id }).from(appRoleAssignments).where(and(
      eq(appRoleAssignments.userId, reviewerUserId), eq(appRoleAssignments.role, 'app_admin'),
    )).limit(1)
    if (!role) throw new GovernancePreparationError('Current app-admin role required.', 403)
    const [record] = await transaction.insert(issuanceProposalDecisions).values({
      artifactId, artifactSha256: artifact.artifactSha256,
      reviewerUserId, decision, note: note.trim(),
    }).returning()
    await transaction.insert(auditEvents).values({
      action: `issuance_proposal.${decision}`, actorType: 'portal_user', actorId: reviewerUserId,
      entityType: 'issuance_proposal_artifact', entityId: artifactId,
      details: { artifactSha256: artifact.artifactSha256, note: note.trim() },
    })
    return record
  })
}

export function equivalentSimulation(a: ProposalSimulation, b: ProposalSimulation): boolean {
  const comparable = (simulation: ProposalSimulation) => ({
    config: { ...simulation.config, blockNumber: undefined, blockHash: undefined },
    submitter: simulation.submitter, delegatedVotesRaw: simulation.delegatedVotesRaw,
    autoSponsor: simulation.autoSponsor, requiredValueRaw: simulation.requiredValueRaw,
    actionSuccess: simulation.actionSuccess, submissionSuccess: simulation.submissionSuccess,
    simulatedProposalId: simulation.simulatedProposalId,
  })
  return canonicalSha256(comparable(a)) === canonicalSha256(comparable(b))
}

export async function prepareProposalTransaction(artifactId: string, requesterUserId: string) {
  await requireCurrentAdmin(requesterUserId)
  const state = await getProposalArtifact(artifactId)
  if (!state.ready) throw new GovernancePreparationError('Proposal artifact is unapproved, expired, stale, or superseded.')
  const artifact = state.record.artifact as ProposalArtifactPayload
  const client = governanceClient()
  const pinnedBlock = await client.getBlock({ blockNumber: BigInt(artifact.simulation.config.blockNumber) })
  if (pinnedBlock.hash !== artifact.simulation.config.blockHash) throw new GovernancePreparationError('Pinned simulation block changed.')
  const currentSimulation = await simulateBaalProposal(artifact.encoded, artifact.simulation.submitter, client)
  if (!equivalentSimulation(artifact.simulation, currentSimulation)) throw new GovernancePreparationError('Governance configuration or simulation outcome changed; build a new artifact.')
  // A second read closes the obvious review-state race. A wallet must still
  // show the exact target, value, and calldata before the human signs.
  const renewed = await getProposalArtifact(artifactId)
  if (!renewed.ready) throw new GovernancePreparationError('Proposal review changed; build a new artifact.')
  return {
    chainId: 100, from: artifact.simulation.submitter,
    to: artifact.encoded.dao, data: artifact.encoded.submitCalldata,
    valueRaw: artifact.simulation.requiredValueRaw,
    artifactSha256: state.record.artifactSha256,
    snapshotSha256: state.record.snapshotSha256,
    autoSponsor: artifact.simulation.autoSponsor,
    proposalOfferingRaw: artifact.simulation.proposalOfferingRaw,
    warning: artifact.simulation.autoSponsor
      ? 'This address meets the delegated-vote threshold; Baal will auto-sponsor on submission.'
      : 'This address does not meet the delegated-vote threshold and must include the exact proposal offering. A member must sponsor later.',
  }
}
