import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = new URL('../supabase/migrations/001_cmams.sql', import.meta.url)
const stageMigration = new URL(
  '../supabase/migrations/008_first_timer_membership.sql',
  import.meta.url
)

describe('single-church schema', () => {
  it('has no campus identifiers or campus table', () => {
    const sql = readFileSync(migration, 'utf8')
    expect(sql).not.toMatch(/campus_id|CREATE TABLE (?:public\.)?campuses/i)
  })
  it('encodes storage-level check-in, card and audit guarantees', () => {
    const sql = readFileSync(migration, 'utf8')
    expect(sql).toMatch(/UNIQUE\s*\(service_id,\s*person_id\)/i)
    expect(sql).toMatch(/ON qr_cards\s*\(person_id\)\s*WHERE status = 'ACTIVE'/i)
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON audit_logs/i)
    expect(sql).toMatch(/BEFORE TRUNCATE ON audit_logs/i)
    expect(sql).toMatch(/staff_users_email_lower_key/i)
    expect(sql).toMatch(/ON CONFLICT\s*\(service_id,\s*person_id\) DO NOTHING/i)
    expect(sql).toMatch(/a\.person_id <> c\.person_id/i)
    expect(sql).toMatch(
      /EXCEPTION WHEN unique_violation[\s\S]*WHERE idempotency_key=p_idempotency_key/i
    )
  })
})

describe('first-timer membership promotion', () => {
  it('promotes after two distinct services without a consecutive requirement', () => {
    const sql = readFileSync(stageMigration, 'utf8')
    expect(sql).toMatch(/AFTER INSERT ON attendance_records/i)
    expect(sql).toMatch(/count\(\*\)[\s\S]*attendance_records/i)
    expect(sql).toMatch(/attended_services < 2/i)
    expect(sql).toMatch(/SET lifecycle_stage = 'MEMBER'/i)
    expect(sql).toMatch(/INSERT INTO person_stage_history/i)
    expect(sql).toMatch(/PERSON_STAGE_CHANGED/i)
  })
})
