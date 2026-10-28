import { z } from 'zod'
import type pg from 'pg'
import { maskPhone, type StaffRole } from './rbac.js'

export class DuplicatePersonError extends Error {
  constructor(readonly matches: unknown[]) {
    super('Possible duplicate. Review existing profiles before registering.')
  }
}

const registration = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  compoundId: z.uuid(),
  room: z.string().trim().max(100).optional(),
  departmentId: z.uuid().optional(),
  birthMonth: z.number().int().min(1).max(12),
  birthDay: z.number().int().min(1).max(31),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  phone: z
    .union([z.string().regex(/^\+[1-9]\d{7,14}$/), z.null()])
    .optional(),
  householdId: z.uuid().optional(),
  consent: z.literal(true),
  confirmDistinct: z.boolean().optional(),
}).refine((data) => {
  // A yearless February 29 is possible; use a known leap year to validate it.
  const year = data.birthYear ?? 2000
  const date = new Date(Date.UTC(year, data.birthMonth - 1, data.birthDay))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === data.birthMonth - 1 &&
    date.getUTCDate() === data.birthDay
}, { path: ['birthDay'], message: 'Enter a valid calendar date' })
export type Registration = z.infer<typeof registration>
export function validateRegistration(input: unknown) {
  const data = registration.parse(input)
  return { ...data, phone: data.phone ?? null }
}

export class InvalidCatalogSelection extends Error {
  constructor() { super('Choose an active compound and department') }
}
export function reversedName(fullName: string) {
  return fullName.trim().split(/\s+/).reverse().join(' ')
}

type Db = Pick<pg.Pool, 'query' | 'connect'>

export async function findDuplicates(
  db: Db,
  fullName: string,
  phone: string | null,
  email: string | null = null
) {
  const name = fullName.trim().toLowerCase()
  const result = await db.query(
    `SELECT id,member_code,first_name,last_name,household_id,
      greatest(similarity(full_name_normalized,$1),similarity(full_name_normalized,$2)) AS score,
       (phone_e164=$3 AND $3 IS NOT NULL) AS shared_phone
    FROM people WHERE deleted_at IS NULL AND (
       phone_e164=$3 AND $3 IS NOT NULL OR
       lower(email)=lower($4) AND $4 IS NOT NULL OR
       similarity(full_name_normalized,$1)>0.5 OR similarity(full_name_normalized,$2)>0.5)
     ORDER BY (phone_e164=$3 AND $3 IS NOT NULL) DESC,
       (lower(email)=lower($4) AND $4 IS NOT NULL) DESC, score DESC LIMIT 5`,
    [name, reversedName(name), phone, email]
  )
  return result.rows
}

export async function registerPerson(db: Db, input: unknown, staffId: string) {
  const data = validateRegistration(input)
  const matches = await findDuplicates(
    db,
    `${data.firstName} ${data.lastName}`,
    data.phone,
    data.email
  )
  if (matches.length && !data.confirmDistinct)
    throw new DuplicatePersonError(matches)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const compound = await client.query(
      'SELECT id FROM compounds WHERE id=$1 AND is_active=true FOR SHARE',
      [data.compoundId]
    )
    if (!compound.rows.length) throw new InvalidCatalogSelection()
    if (data.departmentId) {
      const department = await client.query(
        'SELECT id FROM departments WHERE id=$1 AND is_active=true FOR SHARE',
        [data.departmentId]
      )
      if (!department.rows.length) throw new InvalidCatalogSelection()
    }
    const created = await client.query(
      `INSERT INTO people(first_name,middle_name,last_name,phone_e164,household_id,privacy_consent_at,registered_by_staff_id,
        email,compound_id,room,birth_month,birth_day,birth_year)
       VALUES($1,$2,$3,$4,$5,now(),$6,$7,$8,$9,$10,$11,$12)
       RETURNING id,member_code,first_name,last_name,lifecycle_stage`,
      [
        data.firstName,
        data.middleName ?? null,
        data.lastName,
        data.phone,
        data.householdId ?? null,
        staffId,
        data.email,
        data.compoundId,
        data.room || null,
        data.birthMonth,
        data.birthDay,
        data.birthYear ?? null,
      ]
    )
    const person = created.rows[0]
    if (data.departmentId) {
      await client.query(
        `INSERT INTO person_departments(person_id,department_id,assigned_by_staff_id)
         VALUES($1,$2,$3)`,
        [person.id, data.departmentId, staffId]
      )
    }
    await client.query(
      `INSERT INTO person_stage_history(person_id,new_stage,changed_by_staff_id,reason)
      VALUES($1,'FIRST_TIMER',$2,'Registered at front desk')`,
      [person.id, staffId]
    )
    await client.query('COMMIT')
    return person
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export type PeopleListOptions = {
  stage?: string
  page?: number
  pageSize?: number
}

export async function listPeoplePaginated(
  db: Db,
  _role: StaffRole,
  search: string,
  options: PeopleListOptions = {}
) {
  const page = Math.max(1, Math.min(1000, Math.trunc(options.page ?? 1)))
  const pageSize = Math.max(
    1,
    Math.min(100, Math.trunc(options.pageSize ?? 20))
  )
  const stage = (options.stage ?? '').trim().toUpperCase()
  const validStage = [
    'FIRST_TIMER',
    'RETURNING_VISITOR',
    'REGULAR_ATTENDEE',
    'MEMBER',
    'INACTIVE',
    'ARCHIVED',
  ].includes(stage)
    ? stage
    : ''
  const offset = (page - 1) * pageSize

  const result = await db.query(
    `SELECT p.id,p.member_code,p.first_name,p.last_name,p.phone_e164,p.lifecycle_stage,p.registered_at,
      (SELECT count(*)::int FROM attendance_records a WHERE a.person_id=p.id) AS attendance_count,
      (SELECT max(a.checked_in_at) FROM attendance_records a WHERE a.person_id=p.id) AS last_attended_at,
      count(*) OVER()::int AS total_count
    FROM people p
    WHERE p.deleted_at IS NULL
      AND ($1 = '' OR p.full_name_normalized ILIKE '%' || lower($1) || '%' OR p.member_code ILIKE '%' || $1 || '%')
      AND ($2 = '' OR p.lifecycle_stage::text = $2)
    ORDER BY p.registered_at DESC
    LIMIT $3 OFFSET $4`,
    [search.slice(0, 80), validStage, pageSize, offset]
  )

  const total = result.rows.length > 0
    ? Number((result.rows[0] as { total_count: number }).total_count)
    : Number((await db.query(
        `SELECT count(*)::int AS total_count FROM people p
         WHERE p.deleted_at IS NULL
           AND ($1 = '' OR p.full_name_normalized ILIKE '%' || lower($1) || '%' OR p.member_code ILIKE '%' || $1 || '%')
           AND ($2 = '' OR p.lifecycle_stage::text = $2)`,
        [search.slice(0, 80), validStage]
      )).rows[0].total_count)
  const people = result.rows.map(
    ({
      phone_e164,
      total_count: _total,
      ...row
    }: Record<string, unknown> & { phone_e164: string | null }) => ({
      ...row,
      phone: maskPhone(phone_e164),
    })
  )

  return {
    people,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function listPeople(db: Db, role: StaffRole, search: string) {
  const { people } = await listPeoplePaginated(db, role, search, {
    page: 1,
    pageSize: 100,
  })
  return people
}

export async function getPersonAttendanceHistory(
  db: Db,
  _role: StaffRole,
  personId: string
) {
  const personResult = await db.query(
    `SELECT p.id,p.member_code,p.first_name,p.last_name,p.phone_e164,p.lifecycle_stage,p.registered_at,
      (SELECT count(*)::int FROM attendance_records a WHERE a.person_id=p.id) AS attendance_count
    FROM people p WHERE p.id=$1 AND p.deleted_at IS NULL`,
    [personId]
  )
  const row = personResult.rows[0] as
    | {
        id: string
        member_code: string
        first_name: string
        last_name: string
        phone_e164: string | null
        attendance_count: number
        lifecycle_stage: string
        registered_at: string
      }
    | undefined
  if (!row) return null

  const historyResult = await db.query(
    `SELECT a.id,a.service_id,a.checked_in_at,a.checkin_method,a.snapshot_stage,
      s.name AS service_name,s.category AS service_category,s.scheduled_start_at
    FROM attendance_records a
    JOIN services s ON s.id=a.service_id
    WHERE a.person_id=$1
    ORDER BY a.checked_in_at DESC
    LIMIT 100`,
    [personId]
  )

  const { phone_e164, ...rest } = row
  return {
    person: {
      ...rest,
      phone: maskPhone(phone_e164),
    },
    history: historyResult.rows,
  }
}
