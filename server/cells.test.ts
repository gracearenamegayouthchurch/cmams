import { expect, it } from 'vitest'
import { CellAccessError, listCellMembers, requireCellScope } from './cells.js'

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
