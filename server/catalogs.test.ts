import { expect, it } from 'vitest'
import {
  CatalogError,
  createCatalogEntry,
  deactivateCatalogEntry,
  listActiveCatalogs,
  mergeCompounds,
  updateCompound,
} from './catalogs.js'

const source = '11111111-1111-4111-8111-111111111111'
const target = '22222222-2222-4222-8222-222222222222'

it('lists active compounds with regions, departments, and the region choices', async () => {
  const statements: string[] = []
  const db = {
    query: async (sql: string) => {
      statements.push(sql)
      return {
        rows: sql.includes('FROM compounds')
          ? [
              {
                id: '1',
                name: 'Main Campus',
                region: 'ACROSS',
                is_active: true,
                member_count: 2,
              },
            ]
          : [{ id: '2', name: 'Choir' }],
      }
    },
  }
  const result = await listActiveCatalogs(db as never)
  expect(result.compounds).toEqual([
    {
      id: '1',
      name: 'Main Campus',
      region: 'ACROSS',
      is_active: true,
      member_count: 2,
    },
  ])
  expect(result.regions.map((region) => region.label)).toEqual([
    'Across',
    'Ndar',
    'Chikam',
    'Hostel',
  ])
  expect(statements).toHaveLength(2)
  expect(statements.every((sql) => sql.includes('is_active=true'))).toBe(true)
})

it('does not create compounds from the catalog screen', async () => {
  const db = { query: async () => ({ rows: [] }) }
  await expect(
    createCatalogEntry(db as never, 'compounds', 'North')
  ).rejects.toBeInstanceOf(CatalogError)
})

it('allows only compound and department tables in catalog mutations', async () => {
  const db = { query: async () => ({ rows: [{ id: '1', name: 'Choir' }] }) }
  await expect(
    createCatalogEntry(db as never, 'staff_users' as never, 'Intruder')
  ).rejects.toThrow()
  await expect(
    deactivateCatalogEntry(db as never, 'staff_users' as never, 'id')
  ).rejects.toThrow()
})

it('renames and moves a compound while recording the region', async () => {
  const statements: { sql: string; params?: unknown[] }[] = []
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      statements.push({ sql, params })
      if (sql.includes('UPDATE compounds'))
        return {
          rows: [
            {
              id: source,
              name: 'Army Barracks',
              region: 'NDAR',
              is_active: true,
            },
          ],
        }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  const result = await updateCompound(
    db as never,
    source,
    { name: 'Army Barracks', region: 'NDAR' },
    'staff'
  )
  expect(result).toMatchObject({ name: 'Army Barracks', region: 'NDAR' })
  expect(
    statements.find(({ sql }) => sql.includes('UPDATE compounds'))?.params
  ).toEqual([source, 'Army Barracks', 'NDAR'])
  expect(statements.some(({ sql }) => sql.includes('COMPOUND_UPDATED'))).toBe(
    true
  )
  expect(statements.at(-1)?.sql).toBe('COMMIT')
})

it('merges duplicate compounds by moving members and attendance snapshots', async () => {
  const statements: { sql: string; params?: unknown[] }[] = []
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      statements.push({ sql, params })
      if (sql.includes('FROM compounds') && sql.includes('ANY'))
        return {
          rows: [
            { id: source, name: 'East Gate', region: 'ACROSS', is_active: true },
            {
              id: target,
              name: 'East Gate Extension',
              region: 'ACROSS',
              is_active: true,
            },
          ],
        }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await mergeCompounds(db as never, source, target, 'staff')
  expect(
    statements.find(({ sql }) => sql.includes('UPDATE people'))?.params
  ).toEqual([source, target])
  expect(
    statements.find(({ sql }) => sql.includes('UPDATE attendance_records'))
      ?.params
  ).toEqual([source, target])
  expect(
    statements.find(
      ({ sql }) => sql.includes('UPDATE compounds SET is_active=false')
    )?.params
  ).toEqual([source])
  expect(statements.some(({ sql }) => sql.includes('COMPOUND_MERGED'))).toBe(
    true
  )
  expect(statements.at(-1)?.sql).toBe('COMMIT')
})

it('refuses to merge a compound into itself', async () => {
  const db = { query: async () => ({ rows: [] }), connect: async () => ({}) }
  await expect(
    mergeCompounds(db as never, source, source, 'staff')
  ).rejects.toBeInstanceOf(CatalogError)
})
