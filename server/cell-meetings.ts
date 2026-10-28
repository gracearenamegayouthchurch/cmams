import { z } from 'zod'
import type pg from 'pg'
import { credentialLookup } from './checkins.js'
import { requireCellScope, type CellActor } from './cells.js'

type Db = Pick<pg.Pool, 'connect' | 'query'>

export class CellMeetingError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}

const dates = z.object({
  start: z.iso.datetime({ offset: true }),
  opens: z.iso.datetime({ offset: true }),
  closes: z.iso.datetime({ offset: true }),
})

export function validateCellMeeting(input: unknown) {
  const data = dates.parse(input)
  const start = new Date(data.start)
  const opens = new Date(data.opens)
  const closes = new Date(data.closes)
  if (closes <= opens) throw new CellMeetingError('Check-in must close after it opens', 400)
  const localDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
  const day = localDay.format(start)
  if (!day.startsWith('Sat') || localDay.format(opens) !== day || localDay.format(closes) !== day)
    throw new CellMeetingError('Cell meetings and check-in windows must stay on the same Saturday in Africa/Lagos time', 400)
  return { start, opens, closes }
}

export async function listCellMeetings(db: Db, cellId: string, actor: CellActor) {
  const id = z.uuid().parse(cellId)
  await requireCellScope(db, actor, id)
  const result = await db.query(
    `SELECT m.id,m.cell_id,m.scheduled_start_at,m.checkin_opens_at,m.checkin_closes_at,m.status,
       count(a.id)::int AS attendance_count
     FROM cell_meetings m JOIN cells c ON c.id=m.cell_id
     LEFT JOIN cell_attendance a ON a.meeting_id=m.id
     WHERE m.cell_id=$1 GROUP BY m.id ORDER BY m.scheduled_start_at DESC LIMIT 100`,
    [id]
  )
  return result.rows
}

export async function listCellMeetingAttendance(db: Db, meetingId: string, actor: CellActor) {
  const id = z.uuid().parse(meetingId)
  const meeting = await db.query('SELECT cell_id FROM cell_meetings WHERE id=$1', [id])
  if (!meeting.rows.length) throw new CellMeetingError('Meeting unavailable', 404)
  await requireCellScope(db, actor, meeting.rows[0].cell_id)
  const result = await db.query(
    `SELECT a.id,a.person_id,a.checked_in_at,p.member_code,p.first_name,p.last_name
     FROM cell_attendance a JOIN people p ON p.id=a.person_id
     WHERE a.meeting_id=$1 ORDER BY a.checked_in_at DESC LIMIT 500`, [id]
  )
  return result.rows
}

export async function createCellMeeting(db: Db, cellId: string, input: unknown, actor: CellActor) {
  const id = z.uuid().parse(cellId)
  const data = validateCellMeeting(input)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await requireCellScope(client, actor, id)
    const cell = await client.query('SELECT id FROM cells WHERE id=$1 AND is_active=true FOR SHARE', [id])
    if (!cell.rows.length) throw new CellMeetingError('Cell is unavailable', 404)
    const created = await client.query(
      `INSERT INTO cell_meetings(cell_id,scheduled_start_at,checkin_opens_at,checkin_closes_at,created_by_staff_id)
       VALUES($1,$2,$3,$4,$5) RETURNING id,cell_id,scheduled_start_at,checkin_opens_at,checkin_closes_at,status`,
      [id, data.start, data.opens, data.closes, actor.id]
    )
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
       VALUES($1,'CELL_MEETING_CREATED','cell_meeting',$2)`, [actor.id, created.rows[0].id]
    )
    await client.query('COMMIT')
    return created.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function transitionCellMeeting(db: Db, meetingId: string, action: 'open' | 'close', actor: CellActor) {
  const id = z.uuid().parse(meetingId)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const row = await client.query(
      `SELECT m.cell_id,m.status FROM cell_meetings m JOIN cells c ON c.id=m.cell_id
       WHERE m.id=$1 AND c.is_active=true FOR UPDATE OF m`, [id]
    )
    if (!row.rows.length) throw new CellMeetingError('Meeting unavailable', 404)
    await requireCellScope(client, actor, row.rows[0].cell_id)
    const next = action === 'open' ? 'CHECKIN_OPEN' : 'CHECKIN_CLOSED'
    const previous = action === 'open' ? 'SCHEDULED' : 'CHECKIN_OPEN'
    const result = await client.query(
      `UPDATE cell_meetings SET status=$2 WHERE id=$1 AND status=$3
       AND ($2 <> 'CHECKIN_OPEN' OR now() BETWEEN checkin_opens_at AND checkin_closes_at)
       RETURNING id,cell_id,status`,
      [id, next, previous]
    )
    if (!result.rows.length) throw new CellMeetingError('Meeting status or check-in window does not allow this action')
    await client.query(
      `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
       VALUES($1,$2,'cell_meeting',$3)`, [actor.id, action === 'open' ? 'CELL_MEETING_OPENED' : 'CELL_MEETING_CLOSED', id]
    )
    await client.query('COMMIT')
    return result.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function scanCellCard(db: Db, meetingId: string, credential: string, eventId: string, actor: CellActor) {
  const id = z.uuid().parse(meetingId)
  const key = z.uuid().parse(eventId)
  const lookup = credentialLookup(credential)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const meeting = await client.query(
      `SELECT m.id,m.cell_id,m.status,c.is_active,now() AS current_time,m.checkin_opens_at,m.checkin_closes_at
       FROM cell_meetings m JOIN cells c ON c.id=m.cell_id WHERE m.id=$1 FOR UPDATE OF m`, [id]
    )
    if (!meeting.rows.length || !meeting.rows[0].is_active) throw new CellMeetingError('Meeting unavailable', 404)
    await requireCellScope(client, actor, meeting.rows[0].cell_id)
    const row = meeting.rows[0]
    const current = new Date(row.current_time).getTime()
    if (row.status !== 'CHECKIN_OPEN' || current < new Date(row.checkin_opens_at).getTime() || current > new Date(row.checkin_closes_at).getTime())
      throw new CellMeetingError('Meeting check-in is not open')
    const card = await client.query(
      `SELECT q.id,q.person_id FROM qr_cards q JOIN people p ON p.id=q.person_id
       WHERE q.status='ACTIVE' AND p.deleted_at IS NULL AND p.lifecycle_stage NOT IN ('INACTIVE','ARCHIVED') AND
       (($1::text IS NOT NULL AND q.token_hash=$1) OR ($2::text IS NOT NULL AND q.short_code=$2)) FOR SHARE OF q,p`,
      [lookup.tokenHash, lookup.shortCode]
    )
    if (!card.rows.length) throw new CellMeetingError('Card is invalid or not eligible', 400)
    const member = await client.query(
      `SELECT id FROM cell_memberships WHERE person_id=$1 AND cell_id=$2 AND valid_to IS NULL FOR SHARE`,
      [card.rows[0].person_id, row.cell_id]
    )
    if (!member.rows.length) throw new CellMeetingError('Card is invalid or not eligible', 400)
    const prior = await client.query('SELECT person_id,meeting_id FROM cell_attendance WHERE event_id=$1', [key])
    if (prior.rows.length && (prior.rows[0].person_id !== card.rows[0].person_id || prior.rows[0].meeting_id !== id))
      throw new CellMeetingError('Check-in request conflicts with another scan')
    const inserted = await client.query(
      `INSERT INTO cell_attendance(meeting_id,person_id,qr_card_id,checked_in_by_staff_id,event_id,checkin_method)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(meeting_id,person_id) DO NOTHING RETURNING id`,
      [id, card.rows[0].person_id, card.rows[0].id, actor.id, key, lookup.method]
    )
    if (inserted.rows.length) {
      await client.query(
        `INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
         VALUES($1,'CELL_CHECKIN','cell_meeting',$2)`, [actor.id, id]
      )
    }
    await client.query('COMMIT')
    return { outcome: inserted.rows.length ? 'CHECKED_IN' : 'ALREADY_CHECKED_IN' }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
