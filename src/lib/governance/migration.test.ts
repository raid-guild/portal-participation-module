import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../../drizzle/0013_proposal_integrity.sql', import.meta.url), 'utf8')

describe('proposal artifact database guardrails', () => {
  it('makes frozen artifacts and decisions append-only', () => {
    expect(migration).toContain('issuance_proposal_artifacts_immutable BEFORE UPDATE OR DELETE')
    expect(migration).toContain('issuance_proposal_decisions_immutable BEFORE UPDATE OR DELETE')
  })

  it('binds decisions to exact artifacts and separates builder and reviewer', () => {
    expect(migration).toContain('NEW.artifact_sha256 IS DISTINCT FROM proposal.artifact_sha256')
    expect(migration).toContain('NEW.reviewer_user_id = proposal.builder_user_id')
    expect(migration).toContain("role = 'app_admin'")
    expect(migration).toContain('proposal.expires_at <= now()')
  })

  it('serializes decisions with freezing and rejects stale payment or wallet evidence', () => {
    const decisionTrigger = migration.slice(migration.indexOf('CREATE FUNCTION participation_validate_proposal_decision_insert'))
    expect(decisionTrigger.indexOf('pg_advisory_xact_lock(hashtext(proposal.period_key), 91843)')).toBeLessThan(decisionTrigger.indexOf('revision > proposal.revision'))
    expect(decisionTrigger).toContain('issuance_review_sources src')
    expect(decisionTrigger).toContain("p.status = 'confirmed'")
    expect(decisionTrigger).toContain("o.status = 'needs_review'")
    expect(decisionTrigger).toContain('w.revoked_at IS NULL')
    expect(decisionTrigger).toContain('ms.eligible')
  })
})
