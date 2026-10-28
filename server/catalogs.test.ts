import { expect, it } from 'vitest'
import { createCatalogEntry, deactivateCatalogEntry, listActiveCatalogs } from './catalogs.js'

it('lists only active compounds and departments', async () => {
  const statements: string[] = []
  const db = { query: async (sql: string) => {
    statements.push(sql)
    return { rows: [{ id: '1', name: 'Main Campus' }] }
  } }
  const result = await listActiveCatalogs(db as never)
  expect(result.compounds).toEqual([{ id: '1', name: 'Main Campus' }])
  expect(statements).toHaveLength(2)
  expect(statements.every((sql) => sql.includes('is_active=true'))).toBe(true)
})

it('allows only compound and department tables in catalog mutations', async () => {
  const db = { query: async () => ({ rows: [{ id: '1', name: 'Choir' }] }) }
  await expect(createCatalogEntry(db as never, 'staff_users' as never, 'Intruder')).rejects.toThrow()
  await expect(deactivateCatalogEntry(db as never, 'staff_users' as never, 'id')).rejects.toThrow()
})
