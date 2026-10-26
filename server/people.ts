import { z } from 'zod'
import type pg from 'pg'
import { maskPhone, type StaffRole } from './rbac.js'

export class DuplicatePersonError extends Error {
  constructor(readonly matches: unknown[]) { super('Possible duplicate. Review existing profiles before registering.') }
}

const registration = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).optional(),
  phone: z.union([z.string().regex(/^\+[1-9]\d{7,14}$/), z.null()]).optional(),
  householdId: z.uuid().optional(), consent: z.literal(true), confirmDistinct: z.boolean().optional(),
})
export type Registration = z.infer<typeof registration>
export function validateRegistration(input: unknown) {
  const data = registration.parse(input)
  return { ...data, phone: data.phone ?? null }
}
export function reversedName(fullName: string) { return fullName.trim().split(/\s+/).reverse().join(' ') }

type Db = Pick<pg.Pool, 'query' | 'connect'>

export async function findDuplicates(db: Db, fullName: string, phone: string | null) {
  const name = fullName.trim().toLowerCase()
  const result = await db.query(`SELECT id,member_code,first_name,last_name,household_id,
      greatest(similarity(full_name_normalized,$1),similarity(full_name_normalized,$2)) AS score,
      (phone_e164=$3 AND $3 IS NOT NULL) AS shared_phone
    FROM people WHERE deleted_at IS NULL AND (
      phone_e164=$3 AND $3 IS NOT NULL OR
      similarity(full_name_normalized,$1)>0.5 OR similarity(full_name_normalized,$2)>0.5)
    ORDER BY (phone_e164=$3 AND $3 IS NOT NULL) DESC, score DESC LIMIT 5`, [name, reversedName(name), phone])
  return result.rows
}

export async function registerPerson(db: Db, input: unknown, staffId: string) {
  const data = validateRegistration(input)
  const matches = await findDuplicates(db, `${data.firstName} ${data.lastName}`, data.phone)
  if (matches.length && !data.confirmDistinct) throw new DuplicatePersonError(matches)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const created = await client.query(`INSERT INTO people(first_name,middle_name,last_name,phone_e164,household_id,privacy_consent_at,registered_by_staff_id)
      VALUES($1,$2,$3,$4,$5,now(),$6) RETURNING id,member_code,first_name,last_name,lifecycle_stage`,
    [data.firstName, data.middleName ?? null, data.lastName, data.phone, data.householdId ?? null, staffId])
    const person = created.rows[0]
    await client.query(`INSERT INTO person_stage_history(person_id,new_stage,changed_by_staff_id,reason)
      VALUES($1,'FIRST_TIMER',$2,'Registered at front desk')`, [person.id, staffId])
    await client.query('COMMIT')
    return person
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
}

export async function listPeople(db: Db, role: StaffRole, search: string) {
  const result = await db.query(`SELECT id,member_code,first_name,last_name,phone_e164,lifecycle_stage,registered_at
    FROM people WHERE deleted_at IS NULL AND ($1 = '' OR full_name_normalized ILIKE '%' || lower($1) || '%' OR member_code ILIKE '%' || $1 || '%')
    ORDER BY registered_at DESC LIMIT 100`, [search.slice(0, 80)])
  return result.rows.map(({ phone_e164, ...row }) => ({ ...row, phone: role === 'ADMIN' || role === 'PASTOR_VIEWER' ? phone_e164 : maskPhone(phone_e164) }))
}
