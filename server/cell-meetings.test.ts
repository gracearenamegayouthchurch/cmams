import { expect, it } from 'vitest'
import { validateCellMeeting, listCellMeetings, scanCellCard, CellMeetingError } from './cell-meetings.js'

const cell = '11111111-1111-4111-8111-111111111111'
const actor = { id: '33333333-3333-4333-8333-333333333333', role: 'ADMIN' as const }

it('requires a Saturday in the church time zone and a valid check-in window', () => {
  const fields = { start: '2026-10-31T09:00:00+01:00', opens: '2026-10-31T08:00:00+01:00', closes: '2026-10-31T11:00:00+01:00' }
  expect(validateCellMeeting(fields).start).toEqual(new Date(fields.start))
  expect(() => validateCellMeeting({ ...fields, start: '2026-11-01T09:00:00+01:00' })).toThrow()
  expect(() => validateCellMeeting({ ...fields, closes: fields.opens })).toThrow()
  expect(() => validateCellMeeting({ ...fields, closes: '2026-11-01T00:30:00+01:00' })).toThrow()
  expect(() => validateCellMeeting({ ...fields, opens: '2026-10-30T23:30:00+01:00' })).toThrow()
})

it('reads cell meeting history without joining service attendance', async () => {
  const statements: string[] = []
  const db = { query: async (sql: string) => { statements.push(sql); return { rows: [] } } }
  await listCellMeetings(db as never, cell, actor)
  expect(statements.join(' ')).not.toMatch(/attendance_records|JOIN services/)
})

it('refuses scanning when the meeting is closed without fetching a card', async () => {
  const statements: string[] = []
  const client = { query: async (sql: string) => {
    statements.push(sql)
    if (sql.includes('FROM cell_meetings')) return { rows: [{ id: 'meeting', cell_id: cell, status: 'CHECKIN_CLOSED', is_active: true }] }
    return { rows: [] }
  }, release: () => {} }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await expect(scanCellCard(db as never, '44444444-4444-4444-8444-444444444444', 'ABC-DEF', '55555555-5555-4555-8555-555555555555', actor)).rejects.toBeInstanceOf(CellMeetingError)
  expect(statements.join(' ')).not.toContain('FROM qr_cards')
})

it('refuses cross-cell scans before looking up a card or exposing member details', async () => {
  const statements: string[] = []
  const client = { query: async (sql: string) => {
    statements.push(sql)
    if (sql.includes('FROM cell_meetings')) return { rows: [{ id: 'meeting', cell_id: cell, status: 'CHECKIN_OPEN', is_active: true }] }
    return { rows: [] }
  }, release: () => {} }
  const db = { connect: async () => client }
  await expect(scanCellCard(db as never, '44444444-4444-4444-8444-444444444444', 'ABC-DEF', '55555555-5555-4555-8555-555555555555', { ...actor, role: 'CELL_LEADER' })).rejects.toThrow('Cell access not permitted')
  expect(statements.join(' ')).not.toContain('FROM qr_cards')
})

it('only resolves active cards for non-deleted, eligible people before checking membership', async () => {
  const statements: string[] = []
  const client = { query: async (sql: string) => {
    statements.push(sql)
    if (sql.includes('FROM cell_meetings')) return { rows: [{ id: 'meeting', cell_id: cell, status: 'CHECKIN_OPEN', is_active: true, current_time: '2026-10-31T09:00:00+01:00', checkin_opens_at: '2026-10-31T08:00:00+01:00', checkin_closes_at: '2026-10-31T11:00:00+01:00' }] }
    return { rows: [] }
  }, release: () => {} }
  await expect(scanCellCard({ connect: async () => client } as never, '44444444-4444-4444-8444-444444444444', 'ABC-DEF', '55555555-5555-4555-8555-555555555555', actor)).rejects.toBeInstanceOf(CellMeetingError)
  const lookup = statements.find((sql) => sql.includes('FROM qr_cards'))
  expect(lookup).toMatch(/JOIN people/)
  expect(lookup).toMatch(/deleted_at IS NULL/)
  expect(lookup).toMatch(/INACTIVE|ARCHIVED/)
})

it('records Saturday cell attendance without writing church-service attendance, and treats repeat scans as already checked in', async () => {
  const statements: string[] = []
  let inserted = false
  const client = { query: async (sql: string) => {
    statements.push(sql)
    if (sql.includes('FROM cell_meetings')) return { rows: [{ id: 'meeting', cell_id: cell, status: 'CHECKIN_OPEN', is_active: true, current_time: '2026-10-31T09:00:00+01:00', checkin_opens_at: '2026-10-31T08:00:00+01:00', checkin_closes_at: '2026-10-31T11:00:00+01:00' }] }
    if (sql.includes('FROM qr_cards')) return { rows: [{ id: 'card', person_id: 'person' }] }
    if (sql.includes('FROM cell_memberships')) return { rows: [{ id: 'membership' }] }
    if (sql.includes('INSERT INTO cell_attendance')) {
      if (inserted) return { rows: [] }
      inserted = true
      return { rows: [{ id: 'attendance' }] }
    }
    return { rows: [] }
  }, release: () => {} }
  const db = { connect: async () => client }
  const meetingId = '44444444-4444-4444-8444-444444444444'
  expect(await scanCellCard(db as never, meetingId, 'ABC-DEF', '55555555-5555-4555-8555-555555555555', actor)).toEqual({ outcome: 'CHECKED_IN' })
  expect(await scanCellCard(db as never, meetingId, 'ABC-DEF', '66666666-6666-4666-8666-666666666666', actor)).toEqual({ outcome: 'ALREADY_CHECKED_IN' })
  expect(statements.join(' ')).not.toMatch(/attendance_records|INSERT INTO services/)
  expect(statements.filter((sql) => sql.includes("'CELL_CHECKIN'"))).toHaveLength(1)
})
