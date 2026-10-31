import { describe, expect, it } from 'vitest'
import { nextWelcomeTime, renderWelcome, queueWelcome, sendManualWelcome, processSmsOutbox, sendImmediateWelcome } from './sms.js'

describe('welcome SMS scheduling', () => {
  it('sends at the chosen Lagos time today, or tomorrow if already past', () => {
    expect(nextWelcomeTime(new Date('2026-10-31T14:00:00Z'), '18:00').toISOString()).toBe('2026-10-31T17:00:00.000Z')
    expect(nextWelcomeTime(new Date('2026-10-31T18:00:00Z'), '18:00').toISOString()).toBe('2026-11-01T17:00:00.000Z')
  })
  it('fills the first name without interpreting template syntax or arbitrary placeholders', () => {
    expect(renderWelcome('Hello {firstName}, welcome!', 'Ada')).toBe('Hello Ada, welcome!')
    expect(() => renderWelcome('Hello {code}', 'Ada')).toThrow()
  })
})

const settings = { enabled: true, welcome_mode: 'MANUAL', daily_time: '18:00', welcome_template: 'Welcome {firstName}' }
it('records one held welcome with normalized number; never sends during enrollment', async () => {
  const queries: { sql: string; params?: unknown[] }[] = []
  const client = { query: async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params })
    return { rows: sql.includes('FROM sms_settings') ? [settings] : [] }
  } }
  await queueWelcome(client as never, 'person-id', '+2348031234567', 'Ada')
  expect(queries[1].sql).toContain('ON CONFLICT DO NOTHING')
  expect(queries[1].params).toEqual(['person-id', '2348031234567', 'Welcome Ada', 'HELD', null])
})

it('repairs a Nigerian number with a leading zero before queueing the SMS', async () => {
  let queued: unknown[] | undefined
  const client = { query: async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM sms_settings')) return { rows: [settings] }
    if (sql.includes('INSERT INTO sms_outbox')) queued = params
    return { rows: [] }
  } }
  await queueWelcome(client as never, 'person-id', '+23408031234567', 'Ada')
  expect(queued?.[1]).toBe('2348031234567')
})

it('holds auto-mode enrollments while sending is disabled instead of creating a surprise backlog', async () => {
  let queued: unknown[] | undefined
  const client = { query: async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM sms_settings')) return { rows: [{ ...settings, enabled: false, welcome_mode: 'IMMEDIATE' }] }
    if (sql.includes('INSERT INTO sms_outbox')) queued = params
    return { rows: [] }
  } }
  await queueWelcome(client as never, 'person-id', '+2348031234567', 'Ada')
  expect(queued?.[3]).toBe('HELD')
})

it('manual send claims exactly once, records accepted result, and disallows a second send', async () => {
  let claimed = false
  const db = { query: async (sql: string) => {
    if (sql.includes('FROM sms_settings')) return { rows: [settings] }
    if (sql.includes("status='PROCESSING'" ) && sql.includes("status='HELD'")) {
      if (claimed) return { rows: [] }
      claimed = true
      return { rows: [{ id: '11111111-1111-4111-8111-111111111111', recipient: '2348031234567', body: 'Welcome Ada' }] }
    }
    return { rows: [] }
  } }
  const send = async () => ({ id: 'accepted' })
  await expect(sendManualWelcome(db as never, '11111111-1111-4111-8111-111111111111', send)).resolves.toBe('SENT')
  await expect(sendManualWelcome(db as never, '11111111-1111-4111-8111-111111111111', send)).rejects.toMatchObject({ status: 409 })
})

it('worker cannot send while disabled and claims due work with row locking when enabled', async () => {
  const statements: string[] = []
  let enabled = false
  const db = { query: async (sql: string) => {
    statements.push(sql)
    if (sql.includes('FROM sms_settings')) return { rows: [{ ...settings, enabled, welcome_mode: 'DAILY' }] }
    return { rows: [] }
  } }
  const send = async () => { throw new Error('unexpected send') }
  expect(await processSmsOutbox(db as never, send)).toEqual({ processed: 0 })
  enabled = true
  expect(await processSmsOutbox(db as never, send)).toEqual({ processed: 0 })
  expect(statements.join(' ')).toContain('FOR UPDATE SKIP LOCKED')
})

it('dispatches an enabled immediate welcome after enrollment, not before commit', async () => {
  const statements: string[] = []
  const db = { query: async (sql: string) => {
    statements.push(sql)
    if (sql.includes('FROM sms_settings')) return { rows: [{ ...settings, welcome_mode: 'IMMEDIATE' }] }
    if (sql.includes('RETURNING id,recipient,body')) return { rows: [{ id: 'job', recipient: '2348031234567', body: 'Welcome Ada' }] }
    return { rows: [] }
  } }
  await expect(sendImmediateWelcome(db as never, 'person-id', async () => ({ id: 'accepted' }))).resolves.toBe('SENT')
  expect(statements.join(' ')).toContain("status='PENDING'")
  expect(statements.join(' ')).toContain("status='SENT'")
})
