import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type pg from 'pg'
import { hashPassword, verifyPassword } from './auth.js'
import { roles, type StaffRole } from './rbac.js'

type Db = Pick<pg.Pool, 'query' | 'connect'>

export class StaffError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

const role = z.enum(roles)
const newStaff = z.object({ email: z.email().max(254), fullName: z.string().trim().min(2).max(150), role }).strict()
const staffUpdate = z.object({ role: role.optional(), isActive: z.boolean().optional() })
  .strict().refine((value) => value.role !== undefined || value.isActive !== undefined)

export function validateNewStaff(input: unknown) { return newStaff.parse(input) }
export function validateStaffUpdate(input: unknown) { return staffUpdate.parse(input) }

function temporaryPassword() { return randomBytes(24).toString('base64url') }

export async function listStaff(db: Db) {
  const result = await db.query(`SELECT s.id, s.email, s.full_name, s.role, s.is_active, s.created_at, s.last_login_at,
    s.must_change_password, s.must_complete_profile, s.person_id,
    p.member_code, p.phone_e164, p.academic_level,
    d.name AS department_name
    FROM staff_users s
    LEFT JOIN people p ON p.id = s.person_id AND p.deleted_at IS NULL
    LEFT JOIN person_departments pd ON pd.person_id = p.id AND pd.valid_to IS NULL
    LEFT JOIN departments d ON d.id = pd.department_id
    ORDER BY s.created_at DESC`)
  return result.rows
}

export async function createStaff(db: Db, input: unknown, actorId: string) {
  const data = validateNewStaff(input)
  const password = temporaryPassword()
  const hash = await hashPassword(password)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const existingPerson = (
      await client.query(
        'SELECT id FROM people WHERE lower(email)=lower($1) AND deleted_at IS NULL LIMIT 1',
        [data.email]
      )
    ).rows[0] as { id: string } | undefined
    const personId = existingPerson ? existingPerson.id : null
    const mustCompleteProfile = !existingPerson

    const created = await client.query(
      `INSERT INTO staff_users(email,full_name,password_hash,role,must_change_password,person_id,must_complete_profile)
       VALUES(lower($1),$2,$3,$4,true,$5,$6)
       RETURNING id,email,full_name,role,is_active,created_at,last_login_at,must_change_password,must_complete_profile,person_id`,
      [data.email, data.fullName, hash, data.role, personId, mustCompleteProfile]
    )
    const staff = created.rows[0]
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id,new_state)
       VALUES($1,'STAFF_CREATED','staff',$2,jsonb_build_object('role',$3))`,
      [actorId, staff.id, data.role]
    )
    await client.query('COMMIT')
    return { staff, temporaryPassword: password }
  } catch (error) {
    await client.query('ROLLBACK')
    if (isUniqueViolation(error)) throw new StaffError('A staff account with this email already exists', 409)
    throw error
  } finally { client.release() }
}

export async function updateStaff(db: Db, id: string, input: unknown, actorId: string) {
  const data = validateStaffUpdate(input)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    // Serialize all administrator role/activity changes across concurrent requests.
    await client.query('SELECT pg_advisory_xact_lock(47635520)')
    const existing = (await client.query('SELECT id,role,is_active FROM staff_users WHERE id=$1 FOR UPDATE', [id])).rows[0] as
      | { id: string; role: StaffRole; is_active: boolean } | undefined
    if (!existing) throw new StaffError('Staff account not found', 404)
    const nextRole = data.role ?? existing.role
    const nextActive = data.isActive ?? existing.is_active
    if (existing.role === 'ADMIN' && existing.is_active && (nextRole !== 'ADMIN' || !nextActive)) {
      const count = await client.query("SELECT count(*)::int AS count FROM staff_users WHERE role='ADMIN' AND is_active")
      if (Number(count.rows[0].count) <= 1) throw new StaffError('The last active administrator cannot be removed', 409)
    }
    const updated = await client.query(`UPDATE staff_users SET role=$2,is_active=$3,session_version=session_version+1
      WHERE id=$1 RETURNING id,email,full_name,role,is_active,created_at,last_login_at,must_change_password,must_complete_profile,person_id`, [id, nextRole, nextActive])
    await client.query(`INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id,previous_state,new_state)
      VALUES($1,'STAFF_UPDATED','staff',$2,jsonb_build_object('role',$3,'active',$4),jsonb_build_object('role',$5,'active',$6))`,
      [actorId, id, existing.role, existing.is_active, nextRole, nextActive])
    await client.query('COMMIT')
    return updated.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function resetStaffPassword(db: Db, id: string, actorId: string) {
  const password = temporaryPassword()
  const hash = await hashPassword(password)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(`UPDATE staff_users SET password_hash=$2,must_change_password=true,session_version=session_version+1
      WHERE id=$1 AND is_active RETURNING id`, [id, hash])
    if (!result.rows.length) throw new StaffError('Active staff account not found', 404)
    await client.query(`INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
      VALUES($1,'STAFF_PASSWORD_RESET','staff',$2)`, [actorId, id])
    await client.query('COMMIT')
    return { temporaryPassword: password }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function changeOwnPassword(db: Db, id: string, oldPassword: string, nextPassword: string) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT password_hash,session_version FROM staff_users WHERE id=$1 AND is_active FOR UPDATE', [id])
    if (!result.rows.length || !(await verifyPassword(oldPassword, result.rows[0].password_hash)))
      throw new StaffError('Current password is incorrect', 403)
    if (oldPassword === nextPassword) throw new StaffError('Choose a different new password', 400)
    const hash = await hashPassword(nextPassword)
    const updated = await client.query(`UPDATE staff_users SET password_hash=$2,must_change_password=false,session_version=session_version+1
      WHERE id=$1 RETURNING session_version`, [id, hash])
    await client.query(`INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
      VALUES($1,'STAFF_PASSWORD_CHANGED','staff',$1)`, [id])
    await client.query('COMMIT')
    return Number(updated.rows[0].session_version)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}
