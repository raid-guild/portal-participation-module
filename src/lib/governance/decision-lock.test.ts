import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const decisionService = readFileSync(new URL('./service.ts', import.meta.url), 'utf8')
const issuanceService = readFileSync(new URL('../issuance/service.ts', import.meta.url), 'utf8')

describe('proposal decision transaction ordering', () => {
  it('shares the freeze period lock and rechecks eligibility after acquiring it', () => {
    const decision = decisionService.slice(decisionService.indexOf('export async function decideProposalArtifact'), decisionService.indexOf('export function equivalentSimulation'))
    const lock = decision.indexOf('pg_advisory_xact_lock(hashtext(${source.periodKey}), 91843)')
    expect(issuanceService).toContain('pg_advisory_xact_lock(hashtext(${periodKey}), 91843)')
    expect(lock).toBeGreaterThan(0)
    expect(lock).toBeLessThan(decision.indexOf('getIssuanceReviewInTransaction(transaction, artifact.snapshotId)'))
    expect(lock).toBeLessThan(decision.indexOf('latestArtifact'))
    expect(lock).toBeLessThan(decision.indexOf('transaction.insert(issuanceProposalDecisions)'))
    expect(decision).toContain('review.stale')
    expect(decision).toContain('frozen.blockers.length')
  })
})
