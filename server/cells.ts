import { z } from 'zod'
import type pg from 'pg'
import type { StaffRole } from './rbac.js'

type Db = Pick<pg.Pool, 'query' | 'connect'>
export type CellActor = { id: string; role: StaffRole }

export class CellAccessError extends Error {
  constructor() { super('Cell access not permitted') }
}

const cellFields = z.object({ name: z.string().trim().min(1).max(100), location: z.string().trim().min(1).max(200) })

function manager(actor: CellActor) {
  if (actor.role !== 'ADMIN' && actor.role !== 'PASTOR_VIEWER') throw new CellAccessError()
}

export async function requireCellScope(db: Pick<Db, 'query'>, actor: CellActor, cellId: string) {
  if (actor.role === 'ADMIN' || actor.role === 'PASTOR_VIEWER') return
  if (actor.role !== 'CELL_LEADER') throw new CellAccessError()
  const result = await db.query(
    `SELECT a.cell_id FROM cell_leader_assignments a JOIN cells c ON c.id=a.cell_id
     WHERE a.staff_id=$1 AND a.cell_id=$2 AND a.valid_to IS NULL AND c.is_active=true`,
    [actor.id, cellId]
  )
  if (!result.rows.some((row) => row.cell_id === cellId)) throw new CellAccessError()
}

export async function listCells(db: Pick<Db, 'query'>, actor: CellActor) {
  if (actor.role === 'CELL_LEADER') {
    const result = await db.query(
      `SELECT c.id,c.name,c.meeting_location,c.is_active FROM cells c
       JOIN cell_leader_assignments a ON a.cell_id=c.id
       WHERE a.staff_id=$1 AND a.valid_to IS NULL AND c.is_active=true ORDER BY c.name`,
      [actor.id]
    )
    return result.rows
  }
  if (actor.role !== 'ADMIN' && actor.role !== 'PASTOR_VIEWER' && actor.role !== 'REGISTRATION_DESK' && actor.role !== 'SERVICE_SUPERVISOR') throw new CellAccessError()
  const result = await db.query(
    actor.role === 'ADMIN' || actor.role === 'PASTOR_VIEWER'
      ? 'SELECT id,name,meeting_location,is_active FROM cells ORDER BY is_active DESC,name'
      : 'SELECT id,name,meeting_location,is_active FROM cells WHERE is_active=true ORDER BY name'
  )
  return result.rows
}

export async function listCellLeaders(db: Pick<Db, 'query'>, actor: CellActor) {
  manager(actor)
  const result = await db.query(
    `SELECT s.id,s.full_name,a.cell_id FROM staff_users s
     LEFT JOIN cell_leader_assignments a ON a.staff_id=s.id AND a.valid_to IS NULL
     WHERE s.role='CELL_LEADER' AND s.is_active=true ORDER BY s.full_name`
  )
  return result.rows
}

export async function listCellMembers(db: Pick<Db, 'query'>, actor: CellActor, cellId: string) {
  const id = z.uuid().parse(cellId)
  await requireCellScope(db, actor, id)
  const result = await db.query(
    `SELECT p.id,p.member_code,p.first_name,p.middle_name,p.last_name,p.phone_e164,p.email,
      p.room,p.birth_month,p.birth_day,p.birth_year,p.compound_id,compounds.name AS compound_name,
      pd.department_id,departments.name AS department_name,p.lifecycle_stage,p.registered_at
     FROM cell_memberships m
     JOIN cells c ON c.id=m.cell_id AND c.is_active=true
     JOIN people p ON p.id=m.person_id AND p.deleted_at IS NULL
     LEFT JOIN compounds ON compounds.id=p.compound_id
     LEFT JOIN LATERAL (
       SELECT department_id FROM person_departments
       WHERE person_id=p.id AND valid_to IS NULL LIMIT 1
     ) pd ON true
     LEFT JOIN departments ON departments.id=pd.department_id
     WHERE m.cell_id=$1 AND m.valid_to IS NULL ORDER BY p.first_name,p.last_name`,
    [id]
  )
  return result.rows
}

export async function createCell(db: Db, input: unknown, actor: CellActor) {
  manager(actor)
  const data = cellFields.parse(input)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      'INSERT INTO cells(name,meeting_location) VALUES($1,$2) RETURNING id,name,meeting_location,is_active',
      [data.name, data.location]
    )
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
       VALUES($1,'CELL_CREATED','cell',$2)`, [actor.id, result.rows[0].id]
    )
    await client.query('COMMIT')
    return result.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function updateCell(db: Db, cellId: string, input: unknown, actor: CellActor) {
  manager(actor)
  const id = z.uuid().parse(cellId)
  const data = cellFields.parse(input)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE cells SET name=$2,meeting_location=$3,updated_at=now()
       WHERE id=$1 AND is_active=true RETURNING id,name,meeting_location,is_active`,
      [id, data.name, data.location]
    )
    if (!result.rows.length) throw new CellAccessError()
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
       VALUES($1,'CELL_UPDATED','cell',$2)`, [actor.id, id]
    )
    await client.query('COMMIT')
    return result.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function assignMember(db: Db, cellId: string, personId: string, actor: CellActor) {
  manager(actor)
  const cell = z.uuid().parse(cellId)
  const person = z.uuid().parse(personId)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    // Lock the person, not just an existing membership: two first assignments
    // must not pass a missing-row check concurrently.
    const existingPerson = await client.query('SELECT id FROM people WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [person])
    const activeCell = await client.query('SELECT id FROM cells WHERE id=$1 AND is_active=true FOR SHARE', [cell])
    if (!existingPerson.rows.length || !activeCell.rows.length) throw new CellAccessError()
    const current = await client.query('SELECT cell_id FROM cell_memberships WHERE person_id=$1 AND valid_to IS NULL', [person])
    if (current.rows[0]?.cell_id === cell) {
      await client.query('COMMIT')
      return
    }
    await client.query('UPDATE cell_memberships SET valid_to=clock_timestamp() WHERE person_id=$1 AND valid_to IS NULL', [person])
    await client.query('INSERT INTO cell_memberships(cell_id,person_id,assigned_by_staff_id) VALUES($1,$2,$3)', [cell, person, actor.id])
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id,new_state)
       VALUES($1,'CELL_MEMBER_ASSIGNED','person',$2,jsonb_build_object('cell_id',$3))`, [actor.id, person, cell]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function assignLeader(db: Db, cellId: string, staffId: string, actor: CellActor) {
  manager(actor)
  const cell = z.uuid().parse(cellId)
  const leader = z.uuid().parse(staffId)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const activeCell = await client.query('SELECT id FROM cells WHERE id=$1 AND is_active=true FOR UPDATE', [cell])
    const staff = await client.query("SELECT id FROM staff_users WHERE id=$1 AND role='CELL_LEADER' AND is_active=true FOR UPDATE", [leader])
    if (!activeCell.rows.length || !staff.rows.length) throw new CellAccessError()
    const current = await client.query('SELECT staff_id FROM cell_leader_assignments WHERE cell_id=$1 AND valid_to IS NULL', [cell])
    if (current.rows[0]?.staff_id === leader) {
      await client.query('COMMIT')
      return
    }
    await client.query('UPDATE cell_leader_assignments SET valid_to=clock_timestamp() WHERE valid_to IS NULL AND (cell_id=$1 OR staff_id=$2)', [cell, leader])
    await client.query('INSERT INTO cell_leader_assignments(cell_id,staff_id,assigned_by_staff_id) VALUES($1,$2,$3)', [cell, leader, actor.id])
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id,new_state)
       VALUES($1,'CELL_LEADER_ASSIGNED','cell',$2,jsonb_build_object('leader_id',$3))`, [actor.id, cell, leader]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function archiveCell(db: Db, cellId: string, actor: CellActor) {
  manager(actor)
  const id = z.uuid().parse(cellId)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('UPDATE cells SET is_active=false,updated_at=now() WHERE id=$1 AND is_active=true RETURNING id', [id])
    if (!result.rows.length) throw new CellAccessError()
    await client.query('UPDATE cell_memberships SET valid_to=clock_timestamp() WHERE cell_id=$1 AND valid_to IS NULL', [id])
    await client.query('UPDATE cell_leader_assignments SET valid_to=clock_timestamp() WHERE cell_id=$1 AND valid_to IS NULL', [id])
    await client.query(
      `UPDATE cell_meetings SET status='CANCELLED' WHERE cell_id=$1 AND status IN ('SCHEDULED','CHECKIN_OPEN')`, [id]
    )
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
       VALUES($1,'CELL_ARCHIVED','cell',$2)`, [actor.id, id]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
