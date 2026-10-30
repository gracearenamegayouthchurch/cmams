import { expect, it } from 'vitest'
import {
  CellAccessError,
  createCell,
  listCellMembers,
  requireCellScope,
  updateCell,
  updateCellLocation,
} from './cells.js'

const cellId = '11111111-1111-4111-8111-111111111111'

it('denies a cell leader with no current assignment', async () => {
  const db = { query: async () => ({ rows: [] }) }
  await expect(requireCellScope(db as never, { id: 'staff', role: 'CELL_LEADER' }, cellId)).rejects.toBeInstanceOf(CellAccessError)
})

it('allows a leader only for their assigned active cell', async () => {
  const db = { query: async () => ({ rows: [{ cell_id: cellId }] }) }
  await expect(requireCellScope(db as never, { id: 'staff', role: 'CELL_LEADER' }, cellId)).resolves.toBeUndefined()
  await expect(requireCellScope(db as never, { id: 'staff', role: 'CELL_LEADER' }, '22222222-2222-4222-8222-222222222222')).rejects.toBeInstanceOf(CellAccessError)
})

it('does not query church service attendance when listing cell members', async () => {
  const statements: string[] = []
  const db = { query: async (sql: string) => {
    statements.push(sql)
    return { rows: [{ id: 'person', email: 'person@example.org' }] }
  } }
  const members = await listCellMembers(db as never, { id: 'staff', role: 'ADMIN' }, cellId)
  expect(members).toHaveLength(1)
  expect(statements.join(' ')).not.toMatch(/attendance_records|JOIN services|attendance_count|last_attended_at/)
})

it('writes the region when creating and updating a cell', async () => {
  const statements: { sql: string; params?: unknown[] }[] = []
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      statements.push({ sql, params })
      if (sql.startsWith('INSERT INTO cells'))
        return { rows: [{ id: cellId, name: 'Ndar Region 1', meeting_location: 'Hall A', region: 'NDAR', is_active: true }] }
      if (sql.startsWith('UPDATE cells'))
        return { rows: [{ id: cellId, name: 'Ndar Region 1', meeting_location: 'Hall B', region: 'HOSTEL', is_active: true }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { connect: async () => client }
  const actor = { id: 'staff', role: 'ADMIN' as const }

  const created = await createCell(db as never, { name: 'Ndar Region 1', location: 'Hall A', region: 'NDAR' }, actor)
  expect(created.region).toBe('NDAR')
  expect(statements.find((statement) => statement.sql.startsWith('INSERT INTO cells'))).toEqual({
    sql: expect.stringContaining('INSERT INTO cells(name,meeting_location,region)'),
    params: ['Ndar Region 1', 'Hall A', 'NDAR'],
  })

  const updated = await updateCell(db as never, cellId, { name: 'Ndar Region 1', location: 'Hall B', region: 'HOSTEL' }, actor)
  expect(updated.region).toBe('HOSTEL')
  expect(statements.find((statement) => statement.sql.startsWith('UPDATE cells'))?.params).toEqual([
    cellId,
    'Ndar Region 1',
    'Hall B',
    'HOSTEL',
  ])
})

it('rejects a cell without one of the four regions', async () => {
  const db = { connect: async () => { throw new Error('should not connect') } }
  await expect(
    createCell(db as never, { name: 'Unknown', location: 'Hall', region: 'UNKNOWN' }, { id: 'staff', role: 'ADMIN' })
  ).rejects.toThrow()
})

it('creates a cell without a meeting location and stores null', async () => {
  const params: unknown[][] = []
  const db = { connect: async () => ({
    query: async (sql: string, values?: unknown[]) => {
      if (sql.startsWith('INSERT INTO cells')) {
        params.push(values ?? [])
        return { rows: [{ id: cellId, meeting_location: null }] }
      }
      return { rows: [] }
    },
    release: () => {},
  }) }
  const cell = await createCell(db as never, { name: 'Across Region 9', region: 'ACROSS' }, { id: 'staff', role: 'ADMIN' })
  expect(cell.meeting_location).toBeNull()
  expect(params[0]).toEqual(['Across Region 9', null, 'ACROSS'])
})

it('lets an assigned leader set only the location of their active cell', async () => {
  const queries: { sql: string; params?: unknown[] }[] = []
  const db = { connect: async () => ({
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.startsWith('SELECT id FROM cells')) return { rows: [{ id: cellId }] }
      if (sql.includes('FROM cell_leader_assignments')) return { rows: [{ cell_id: cellId }] }
      if (sql.startsWith('UPDATE cells')) return { rows: [{ id: cellId, meeting_location: 'Hall B' }] }
      return { rows: [] }
    }, release: () => {},
  }) }
  const cell = await updateCellLocation(db as never, cellId, { location: ' Hall B ' }, { id: 'leader', role: 'CELL_LEADER' })
  expect(cell.meeting_location).toBe('Hall B')
  expect(queries.find(({ sql }) => sql.startsWith('UPDATE cells'))?.params).toEqual([cellId, 'Hall B'])
  expect(queries.some(({ sql }) => sql.includes('CELL_UPDATED'))).toBe(true)
  expect(queries.at(-1)?.sql).toBe('COMMIT')
})

it('denies a leader without an active assignment before changing a location', async () => {
  const statements: string[] = []
  const db = { connect: async () => ({
    query: async (sql: string) => { statements.push(sql); return { rows: sql.startsWith('SELECT id FROM cells') ? [{ id: cellId }] : [] } },
    release: () => {},
  }) }
  await expect(updateCellLocation(db as never, cellId, { location: 'Hall' }, { id: 'leader', role: 'CELL_LEADER' })).rejects.toBeInstanceOf(CellAccessError)
  expect(statements.some((sql) => sql.startsWith('UPDATE cells'))).toBe(false)
  expect(statements.at(-1)).toBe('ROLLBACK')
})

it('rejects extra fields and blank locations on the location-only action', async () => {
  const db = { connect: async () => { throw new Error('should not connect') } }
  const admin = { id: 'staff', role: 'ADMIN' as const }
  await expect(updateCellLocation(db as never, cellId, { location: 'Hall', name: 'Changed' }, admin)).rejects.toThrow()
  await expect(updateCellLocation(db as never, cellId, { location: '  ' }, admin)).rejects.toThrow()
})

it('does not let an assigned leader edit another cell or an archived cell', async () => {
  for (const active of [true, false]) {
    const statements: string[] = []
    const db = { connect: async () => ({
      query: async (sql: string) => {
        statements.push(sql)
        if (sql.startsWith('SELECT id FROM cells')) return { rows: active ? [{ id: cellId }] : [] }
        return { rows: [] }
      }, release: () => {},
    }) }
    await expect(updateCellLocation(db as never, cellId, { location: 'Hall' }, { id: 'other-leader', role: 'CELL_LEADER' })).rejects.toBeInstanceOf(CellAccessError)
    expect(statements.some((sql) => sql.startsWith('UPDATE cells'))).toBe(false)
  }
})

it('allows an administrator or pastor to assign a location but denies unrelated staff', async () => {
  for (const role of ['ADMIN', 'PASTOR_VIEWER'] as const) {
    const statements: string[] = []
    const db = { connect: async () => ({
      query: async (sql: string) => {
        statements.push(sql)
        if (sql.startsWith('SELECT id FROM cells')) return { rows: [{ id: cellId }] }
        if (sql.startsWith('UPDATE cells')) return { rows: [{ id: cellId, meeting_location: 'Hall' }] }
        return { rows: [] }
      }, release: () => {},
    }) }
    await expect(updateCellLocation(db as never, cellId, { location: ' Hall ' }, { id: 'staff', role })).resolves.toMatchObject({ meeting_location: 'Hall' })
    expect(statements.some((sql) => sql.includes('FROM cell_leader_assignments'))).toBe(false)
  }
  const db = { connect: async () => { throw new Error('should not connect') } }
  await expect(updateCellLocation(db as never, cellId, { location: 'Hall' }, { id: 'staff', role: 'REGISTRATION_DESK' })).rejects.toBeInstanceOf(CellAccessError)
})

it('updates a cell without a location while retaining its name and region', async () => {
  const params: unknown[][] = []
  const db = { connect: async () => ({
    query: async (sql: string, values?: unknown[]) => {
      if (sql.startsWith('UPDATE cells')) { params.push(values ?? []); return { rows: [{ id: cellId, meeting_location: null }] } }
      return { rows: [] }
    }, release: () => {},
  }) }
  await updateCell(db as never, cellId, { name: 'Ndar Region 8', region: 'NDAR', location: '  ' }, { id: 'staff', role: 'PASTOR_VIEWER' })
  expect(params).toEqual([[cellId, 'Ndar Region 8', null, 'NDAR']])
})
