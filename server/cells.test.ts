import { expect, it } from 'vitest'
import {
  CellAccessError,
  createCell,
  listCellMembers,
  requireCellScope,
  updateCell,
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
