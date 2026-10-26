import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { credentialLookup, validateManualReason, manualCheckin } from './checkins.js'

it('hashes an opaque QR token and never uses embedded identity data', () => {
  const raw = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, 22)
  expect(credentialLookup(`cma://v1/${raw}`)).toEqual({ method: 'QR_SCAN', tokenHash: createHash('sha256').update(raw).digest('hex'), shortCode: null })
  expect(() => credentialLookup('https://external.example/qr')).toThrow('Invalid card format')
})

it('normalizes confusing shortcode characters', () => {
  expect(credentialLookup('o1l-m7x')).toEqual({ method: 'SHORTCODE_ENTRY', tokenHash: null, shortCode: '011-M7X' })
})

it('requires a logged reason for a manual check-in', () => {
  expect(() => validateManualReason('  ')).toThrow()
  expect(validateManualReason('Card lost')).toBe('Card lost')
})

it('does not disguise a reused event ID for a different person as a service outage', async () => {
  const statements: string[] = []
  const client = {
    query: async (sql: string) => {
      statements.push(sql)
      if (sql.includes('INSERT INTO attendance_records')) throw Object.assign(new Error('duplicate idempotency key'), { code: '23505', constraint: 'attendance_records_idempotency_key_key' })
      return { rows: [] }
    }, release: () => {},
  }
  await expect(manualCheckin({ connect: async () => client } as never, 'service', 'person', 'event', 'Card lost', 'staff'))
    .rejects.toThrow('Idempotency key already used')
  expect(statements).toContain('ROLLBACK')
})
