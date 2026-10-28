import { z } from 'zod'
import type pg from 'pg'
import {
  COMPOUND_REGIONS,
  compoundRegion,
  type CompoundRegion,
} from './compound-regions.js'

type Db = Pick<pg.Pool, 'query'>
type WritableDb = Pick<pg.Pool, 'query' | 'connect'>
type CatalogKind = 'compounds' | 'departments'

export class CatalogError extends Error {}

function catalogKind(value: unknown): CatalogKind {
  return z.enum(['compounds', 'departments']).parse(value)
}

export async function listActiveCatalogs(db: Db) {
  const compounds = await db.query(
    `SELECT c.id,c.name,c.region,c.is_active,
       (SELECT count(*)::int FROM people p WHERE p.compound_id=c.id AND p.deleted_at IS NULL) AS member_count
     FROM compounds c WHERE c.is_active=true ORDER BY c.region,c.name`
  )
  const departments = await db.query(
    'SELECT id,name FROM departments WHERE is_active=true ORDER BY name'
  )
  return {
    compounds: compounds.rows,
    departments: departments.rows,
    regions: COMPOUND_REGIONS,
  }
}

export async function createCatalogEntry(db: Db, kind: CatalogKind, name: unknown) {
  const table = catalogKind(kind)
  if (table === 'compounds')
    throw new CatalogError('Compounds are created automatically at registration')
  const value = z.string().trim().min(1).max(100).parse(name)
  const result = await db.query(`INSERT INTO ${table}(name) VALUES($1) RETURNING id,name,is_active`, [value])
  return result.rows[0]
}

export async function renameCatalogEntry(db: Db, kind: CatalogKind, id: unknown, name: unknown) {
  const table = catalogKind(kind)
  if (table !== 'departments')
    throw new CatalogError('Compounds are updated with their region')
  const key = z.uuid().parse(id)
  const value = z.string().trim().min(1).max(100).parse(name)
  const result = await db.query(`UPDATE ${table} SET name=$2 WHERE id=$1 AND is_active=true RETURNING id,name,is_active`, [key, value])
  return result.rows[0] ?? null
}

export async function updateCompound(
  db: WritableDb,
  id: unknown,
  input: unknown,
  actorId: string
) {
  const key = z.uuid().parse(id)
  const data = z
    .object({
      name: z.string().trim().min(1).max(100),
      region: compoundRegion,
    })
    .parse(input)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE compounds SET name=$2,region=$3,updated_at=now()
       WHERE id=$1 AND is_active=true
       RETURNING id,name,region,is_active`,
      [key, data.name, data.region]
    )
    if (!result.rows.length) throw new CatalogError('Compound not found')
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id,new_state)
       VALUES($1,'COMPOUND_UPDATED','compound',$2,jsonb_build_object('region',$3))`,
      [actorId, key, data.region]
    )
    await client.query('COMMIT')
    return result.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function mergeCompounds(
  db: WritableDb,
  sourceId: unknown,
  targetId: unknown,
  actorId: string
) {
  const source = z.uuid().parse(sourceId)
  const target = z.uuid().parse(targetId)
  if (source === target) throw new CatalogError('Choose a different compound to merge into')
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const rows = await client.query(
      `SELECT id,name,region,is_active FROM compounds
       WHERE id = ANY($1::uuid[]) FOR UPDATE`,
      [[source, target]]
    )
    const sourceRow = rows.rows.find((row) => row.id === source)
    const targetRow = rows.rows.find((row) => row.id === target)
    if (!sourceRow || !targetRow || !targetRow.is_active)
      throw new CatalogError('Choose two active compounds to merge')
    await client.query('UPDATE people SET compound_id=$2 WHERE compound_id=$1', [source, target])
    await client.query(
      'UPDATE attendance_records SET snapshot_compound_id=$2 WHERE snapshot_compound_id=$1',
      [source, target]
    )
    await client.query('UPDATE compounds SET is_active=false,updated_at=now() WHERE id=$1', [source])
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id,new_state)
       VALUES($1,'COMPOUND_MERGED','compound',$2,jsonb_build_object('merged_id',$3))`,
      [actorId, target, source]
    )
    await client.query('COMMIT')
    return { id: target, name: targetRow.name, region: targetRow.region as CompoundRegion, is_active: true }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function deactivateCatalogEntry(db: Db, kind: CatalogKind, id: unknown) {
  const table = catalogKind(kind)
  const key = z.uuid().parse(id)
  const result = await db.query(`UPDATE ${table} SET is_active=false WHERE id=$1 AND is_active=true RETURNING id,name,is_active`, [key])
  return result.rows[0] ?? null
}
