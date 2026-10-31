import { expect, it, vi } from 'vitest'
import { validateService, changeServiceStatus, createService, editService, cancelService } from './services.js'

const scheduledId = '11111111-1111-4111-8111-111111111111'
const validEdit = { name: 'Updated service', category: 'SPECIAL_EVENT', scheduledStartAt: '2026-11-01T08:00:00Z', opensAt: '2026-11-01T07:00:00Z', closesAt: '2026-11-01T10:00:00Z' }

it('edits only a scheduled service without attendance and audits atomically', async () => {
  const statements: { sql: string; values?: unknown[] }[] = []
  const db = { connect: async () => ({ query: async (sql: string, values?: unknown[]) => {
    statements.push({ sql, values })
    return { rows: sql.includes('UPDATE services') ? [{ id: scheduledId, name: 'Updated service', status: 'SCHEDULED' }] : [] }
  }, release: () => {} }) }
  await expect(editService(db as never, scheduledId, validEdit, 'supervisor')).resolves.toMatchObject({ name: 'Updated service' })
  expect(statements.find(({ sql }) => sql.includes('UPDATE services'))?.sql).toMatch(/status='SCHEDULED'.*NOT EXISTS/s)
  expect(statements.find(({ sql }) => sql.includes('UPDATE services'))?.values).toEqual([scheduledId, 'Updated service', 'SPECIAL_EVENT', validEdit.scheduledStartAt, validEdit.opensAt, validEdit.closesAt])
  expect(statements.find(({ sql }) => sql.includes('INSERT INTO audit_logs'))?.values).toEqual(['supervisor', 'SERVICE_UPDATED', scheduledId])
  expect(statements.at(-1)?.sql).toBe('COMMIT')
})

it('cancels a scheduled service without deleting it', async () => {
  const statements: { sql: string; values?: unknown[] }[] = []
  const db = { connect: async () => ({ query: async (sql: string, values?: unknown[]) => {
    statements.push({ sql, values })
    return { rows: sql.includes('UPDATE services') ? [{ id: scheduledId, status: 'CANCELLED' }] : [] }
  }, release: () => {} }) }
  await expect(cancelService(db as never, scheduledId, 'supervisor')).resolves.toMatchObject({ status: 'CANCELLED' })
  expect(statements.map(({ sql }) => sql).join(' ')).not.toMatch(/DELETE FROM services/i)
  expect(statements.find(({ sql }) => sql.includes('UPDATE services'))?.sql).toMatch(/status='SCHEDULED'.*NOT EXISTS/s)
  expect(statements.find(({ sql }) => sql.includes('INSERT INTO audit_logs'))?.values).toEqual(['supervisor', 'SERVICE_CANCELLED', scheduledId])
})

it('refuses to edit or cancel non-scheduled or attended services', async () => {
  for (const operation of [
    (db: never) => editService(db, scheduledId, validEdit, 'supervisor'),
    (db: never) => cancelService(db, scheduledId, 'supervisor'),
  ]) {
    const statements: string[] = []
    const db = { connect: async () => ({ query: async (sql: string) => { statements.push(sql); return { rows: [] } }, release: () => {} }) }
    await expect(operation(db as never)).rejects.toMatchObject({ code: 'SERVICE_NOT_EDITABLE' })
    expect(statements.some((sql) => sql.includes('INSERT INTO audit_logs'))).toBe(false)
    expect(statements.at(-1)).toBe('ROLLBACK')
  }
})

it('rejects invalid edit times before connecting', async () => {
  const db = { connect: async () => { throw new Error('unexpected connection') } }
  await expect(editService(db as never, scheduledId, { ...validEdit, closesAt: validEdit.opensAt }, 'supervisor')).rejects.toThrow()
})

it('rolls back a service edit if its audit insert fails', async () => {
  const statements: string[] = []
  const db = { connect: async () => ({ query: async (sql: string) => {
    statements.push(sql)
    if (sql.includes('UPDATE services')) return { rows: [{ id: scheduledId, status: 'SCHEDULED' }] }
    if (sql.includes('INSERT INTO audit_logs')) throw new Error('audit unavailable')
    return { rows: [] }
  }, release: () => {} }) }
  await expect(editService(db as never, scheduledId, validEdit, 'supervisor')).rejects.toThrow('audit unavailable')
  expect(statements.at(-1)).toBe('ROLLBACK')
})

it('persists an authorized scheduled service with its check-in window', async () => {
  const writes: unknown[][] = []
  const db = { query: async (sql: string, params: unknown[]) => {
    if (sql.startsWith('INSERT INTO services')) {
      writes.push(params)
      return { rows: [{ id: 'service', name: 'Sunday service', status: 'SCHEDULED' }] }
    }
    throw new Error('Unexpected database query')
  } }
  const result = await createService(db as never, {
    name: ' Sunday service ', category: 'SUNDAY_SERVICE',
    scheduledStartAt: '2026-11-01T08:00:00Z',
    opensAt: '2026-11-01T07:00:00Z',
    closesAt: '2026-11-01T10:00:00Z',
  }, 'supervisor')
  expect(result).toMatchObject({ name: 'Sunday service', status: 'SCHEDULED' })
  expect(writes).toEqual([['Sunday service', 'SUNDAY_SERVICE', '2026-11-01T08:00:00Z', '2026-11-01T07:00:00Z', '2026-11-01T10:00:00Z', 'supervisor']])
})

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
