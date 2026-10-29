import { z } from 'zod'
import type pg from 'pg'

const fields = z.object({
  name: z.string().trim().min(3).max(150),
  category: z.enum(['SUNDAY_SERVICE', 'MIDWEEK_SERVICE', 'DEPARTMENT_MEETING', 'SPECIAL_EVENT', 'LEADERSHIP_MEETING']),
  scheduledStartAt: z.iso.datetime({ offset: true }),
  opensAt: z.iso.datetime({ offset: true }), closesAt: z.iso.datetime({ offset: true }),
}).refine((value) => Date.parse(value.closesAt) > Date.parse(value.opensAt), { message: 'Check-in must close after it opens' })

export function validateService(input: unknown) { return fields.parse(input) }

export async function createService(db: Pick<pg.Pool, 'query'>, input: unknown, staffId: string) {
  const service = validateService(input)
  const result = await db.query(`INSERT INTO services(name,category,scheduled_start_at,checkin_opens_at,checkin_closes_at,created_by_staff_id)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,category,status,scheduled_start_at,checkin_opens_at,checkin_closes_at`,
  [service.name, service.category, service.scheduledStartAt, service.opensAt, service.closesAt, staffId])
  return result.rows[0]
}

export async function listServices(db: Pick<pg.Pool, 'query'>) {
  const result = await db.query(`SELECT id,name,category,status,scheduled_start_at,checkin_opens_at,checkin_closes_at,locked_eligible_member_count
    FROM services WHERE status <> 'CANCELLED' ORDER BY scheduled_start_at DESC LIMIT 50`)
  return result.rows
}

export class ServiceTransitionError extends Error {
  constructor(message: string, readonly code: string) { super(message) }
}

export async function changeServiceStatus(db: Pick<pg.Pool, 'connect'>, serviceId: string, action: 'open' | 'close') {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    // Serialize open/close so two supervisors cannot open different services at once.
    await client.query('SELECT pg_advisory_xact_lock(740001)')
    if (action === 'open') {
      const open = await client.query<{ id: string; name: string }>(
        `SELECT id,name FROM services WHERE status='CHECKIN_OPEN' AND id<>$1 LIMIT 1`,
        [serviceId]
      )
      if (open.rows.length)
        throw new ServiceTransitionError(
          `"${open.rows[0].name}" is already open. Close it before opening another service.`,
          'ANOTHER_SERVICE_OPEN'
        )
    }
    const result = action === 'open'
      ? await client.query(`UPDATE services SET status='CHECKIN_OPEN' WHERE id=$1 AND status='SCHEDULED'
          AND now() BETWEEN checkin_opens_at AND checkin_closes_at RETURNING id,status`, [serviceId])
      : await client.query(`UPDATE services s SET status='CHECKIN_CLOSED', locked_eligible_member_count=(
          SELECT count(*) FROM people p WHERE p.lifecycle_stage='MEMBER' AND p.deleted_at IS NULL
            AND p.registered_at <= s.checkin_opens_at)
          WHERE s.id=$1 AND s.status='CHECKIN_OPEN' RETURNING id,status,locked_eligible_member_count`, [serviceId])
    if (!result.rows.length) {
      if (action === 'open') {
        const current = (await client.query('SELECT status,checkin_opens_at,checkin_closes_at,now() AS db_now FROM services WHERE id=$1', [serviceId])).rows[0]
        if (current?.status === 'SCHEDULED') {
          if (new Date(current.db_now) < new Date(current.checkin_opens_at))
            throw new ServiceTransitionError('The check-in window has not opened yet', 'WINDOW_NOT_STARTED')
          if (new Date(current.db_now) > new Date(current.checkin_closes_at))
            throw new ServiceTransitionError('The check-in window has already ended', 'WINDOW_ENDED')
        }
      }
      throw new ServiceTransitionError('Invalid service transition', 'INVALID_STATE')
    }
    await client.query('COMMIT')
    return result.rows[0]
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
