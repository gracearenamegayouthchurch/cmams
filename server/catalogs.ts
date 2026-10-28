import { z } from 'zod'
import type pg from 'pg'

type Db = Pick<pg.Pool, 'query'>
type CatalogKind = 'compounds' | 'departments'

function catalogKind(value: unknown): CatalogKind {
  return z.enum(['compounds', 'departments']).parse(value)
}

export async function listActiveCatalogs(db: Db) {
  const compounds = await db.query('SELECT id,name FROM compounds WHERE is_active=true ORDER BY name')
  const departments = await db.query('SELECT id,name FROM departments WHERE is_active=true ORDER BY name')
  return { compounds: compounds.rows, departments: departments.rows }
}

export async function createCatalogEntry(db: Db, kind: CatalogKind, name: unknown) {
  const table = catalogKind(kind)
  const value = z.string().trim().min(1).max(100).parse(name)
  const result = await db.query(`INSERT INTO ${table}(name) VALUES($1) RETURNING id,name,is_active`, [value])
  return result.rows[0]
}

export async function renameCatalogEntry(db: Db, kind: CatalogKind, id: unknown, name: unknown) {
  const table = catalogKind(kind)
  const key = z.uuid().parse(id)
  const value = z.string().trim().min(1).max(100).parse(name)
  const result = await db.query(`UPDATE ${table} SET name=$2 WHERE id=$1 AND is_active=true RETURNING id,name,is_active`, [key, value])
  return result.rows[0] ?? null
}

export async function deactivateCatalogEntry(db: Db, kind: CatalogKind, id: unknown) {
  const table = catalogKind(kind)
  const key = z.uuid().parse(id)
  const result = await db.query(`UPDATE ${table} SET is_active=false WHERE id=$1 AND is_active=true RETURNING id,name,is_active`, [key])
  return result.rows[0] ?? null
}
