import { createHash } from 'node:crypto'
import { z } from 'zod'
import type pg from 'pg'

const shortPattern = /^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{3}$/

export function credentialLookup(value: string) {
  const input = value.trim()
  const qr = /^cma:\/\/v1\/([a-zA-Z0-9_-]{22})$/.exec(input)
  if (qr) return { method: 'QR_SCAN' as const, tokenHash: createHash('sha256').update(qr[1]).digest('hex'), shortCode: null }
  const shortCode = input.toUpperCase().replace(/[O]/g, '0').replace(/[IL]/g, '1').replace(/\s/g, '').replace(/^([0-9A-Z]{3})([0-9A-Z]{3})$/, '$1-$2')
  if (shortPattern.test(shortCode)) return { method: 'SHORTCODE_ENTRY' as const, tokenHash: null, shortCode }
  throw new Error('Invalid card format')
}

export function validateManualReason(reason: unknown): string { return z.string().trim().min(3).max(500).parse(reason) }

export class IdempotencyConflict extends Error {
  constructor() { super('Idempotency key already used') }
}

export async function scanCard(db: Pick<pg.Pool, 'query'>, serviceId: string, credential: string, eventId: string, staffId: string) {
  const card = credentialLookup(credential)
  const result = await db.query(`SELECT rpc_process_card_checkin($1::uuid,$2::char(64),$3::varchar(10),$4::uuid,$5::checkin_method,$6::uuid) AS outcome`,
    [serviceId, card.tokenHash, card.shortCode, eventId, card.method, staffId])
  return result.rows[0].outcome
}

export async function manualCheckin(db: Pick<pg.Pool, 'connect'>, serviceId: string, personId: string, eventId: string, reason: string, staffId: string) {
  const explanation = validateManualReason(reason)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(`INSERT INTO attendance_records(service_id,person_id,idempotency_key,checkin_method,manual_reason,
      scanned_by_staff_id,snapshot_stage,snapshot_compound_id,snapshot_course_id)
      SELECT s.id,p.id,$3,'MANUAL_SEARCH',$4,$5,p.lifecycle_stage,p.compound_id,p.course_id FROM services s
      JOIN people p ON p.id=$2 AND p.deleted_at IS NULL AND p.lifecycle_stage NOT IN ('ARCHIVED','INACTIVE')
      WHERE s.id=$1 AND s.status='CHECKIN_OPEN' AND now() BETWEEN s.checkin_opens_at AND s.checkin_closes_at
      ON CONFLICT (service_id, person_id) DO NOTHING RETURNING id,checked_in_at`,
      [serviceId, personId, eventId, explanation, staffId])
    if (!inserted.rows.length) {
      const existing = await client.query('SELECT checked_in_at FROM attendance_records WHERE service_id=$1 AND person_id=$2', [serviceId, personId])
      await client.query('COMMIT')
      return existing.rows.length ? { outcome: 'ALREADY_CHECKED_IN', checked_in_at: existing.rows[0].checked_in_at } : { outcome: 'SERVICE_CLOSED' }
    }
    await client.query(`INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id,new_state)
      VALUES($1,'MANUAL_CHECKIN','attendance',$2,jsonb_build_object('reason',$3))`, [staffId, inserted.rows[0].id, explanation])
    await client.query('COMMIT')
    return { outcome: 'CHECKED_IN', checked_in_at: inserted.rows[0].checked_in_at }
  } catch (error) {
    await client.query('ROLLBACK')
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505' &&
      'constraint' in error && error.constraint === 'attendance_records_idempotency_key_key') throw new IdempotencyConflict()
    throw error
  }
  finally { client.release() }
}
