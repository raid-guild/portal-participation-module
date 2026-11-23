import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../../drizzle/0011_issuance_integrity.sql', import.meta.url), 'utf8')

describe('issuance database integrity migration', () => {
  it('closes source inserts after the snapshot transaction and checks the complete canonical manifest', () => {
    expect(migration).toContain("creation_xid IS DISTINCT FROM (pg_current_xact_id()::xid)::text")
    expect(migration).toContain("Issuance source does not exactly match the frozen payload")
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED')
    expect(migration).toContain('Frozen issuance source manifest is incomplete')
  })

  it('enforces exact decision hash and creator/reviewer separation at the database boundary', () => {
    expect(migration).toContain('NEW.payload_sha256 IS DISTINCT FROM frozen.payload_sha256')
    expect(migration).toContain('NEW.reviewer_user_id = frozen.created_by_user_id')
    expect(migration).toContain("role = 'app_admin'")
    expect(migration).toContain('Superseded issuance revision cannot receive a decision')
  })
})
