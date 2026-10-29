import { expect, it, vi } from 'vitest'
import { validateService, changeServiceStatus } from './services.js'

function mockClient(handler: (sql: string) => { rows: unknown[] }) {
  const query = vi.fn(async (sql: string) => handler(sql))
  const release = vi.fn()
  const connect = vi.fn(async () => ({ query, release }))
  return { db: { connect } as never, query, release }
}

it('rejects a service with a closing time before its opening time', () => {
  expect(() => validateService({ name: 'Sunday service', category: 'SUNDAY_SERVICE', scheduledStartAt: '2026-11-01T09:00:00Z', opensAt: '2026-11-01T10:00:00Z', closesAt: '2026-11-01T09:00:00Z' })).toThrow()
})

it('does not reopen a closed service', async () => {
  const { db } = mockClient((sql) => {
    if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT' || sql.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (sql.includes("WHERE status='CHECKIN_OPEN' AND id<>")) return { rows: [] }
    if (sql.includes("SET status='CHECKIN_OPEN'")) return { rows: [] }
    if (sql.includes('SELECT status')) return { rows: [{ status: 'CHECKIN_CLOSED' }] }
    throw new Error(`Unexpected query: ${sql}`)
  })
  await expect(changeServiceStatus(db, 'service', 'open')).rejects.toThrow('Invalid service transition')
})

it('reports when a scheduled check-in window has not begun', async () => {
  const { db } = mockClient((sql) => {
    if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT' || sql.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (sql.includes("WHERE status='CHECKIN_OPEN' AND id<>")) return { rows: [] }
    if (sql.includes("SET status='CHECKIN_OPEN'")) return { rows: [] }
    if (sql.includes('SELECT status')) return { rows: [{ status: 'SCHEDULED', checkin_opens_at: '2026-11-01T06:00:00Z', checkin_closes_at: '2026-11-01T10:00:00Z', db_now: '2026-10-27T02:00:00Z' }] }
    throw new Error(`Unexpected query: ${sql}`)
  })
  await expect(changeServiceStatus(db, 'service', 'open')).rejects.toMatchObject({ code: 'WINDOW_NOT_STARTED' })
})

it('opens a service when no other service is open', async () => {
  const { db, query, release } = mockClient((sql) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (sql.includes("WHERE status='CHECKIN_OPEN' AND id<>")) return { rows: [] }
    if (sql.includes("SET status='CHECKIN_OPEN'")) return { rows: [{ id: 'service', status: 'CHECKIN_OPEN' }] }
    throw new Error(`Unexpected query: ${sql}`)
  })
  await expect(changeServiceStatus(db, 'service', 'open')).resolves.toMatchObject({ status: 'CHECKIN_OPEN' })
  expect(query).toHaveBeenCalledWith('COMMIT')
  expect(release).toHaveBeenCalledOnce()
})

it('refuses to open a second service while another is already open', async () => {
  const { db, query, release } = mockClient((sql) => {
    if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT' || sql.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (sql.includes("WHERE status='CHECKIN_OPEN' AND id<>")) return { rows: [{ id: 'other', name: 'Sunday Service' }] }
    throw new Error(`Unexpected query: ${sql}`)
  })

  await expect(changeServiceStatus(db, 'target', 'open')).rejects.toMatchObject({
    code: 'ANOTHER_SERVICE_OPEN',
    message: expect.stringContaining('Sunday Service'),
  })
  expect(query).toHaveBeenCalledWith('ROLLBACK')
  expect(release).toHaveBeenCalledOnce()
})
