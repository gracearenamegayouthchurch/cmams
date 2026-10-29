import type pg from 'pg'
import { dashboardSummary, turnoutPercent } from './reports.js'

type AnalyticsDb = Pick<pg.Pool, 'query'>

export type AnalyticsBreakdown = {
  id: string
  name: string
  members: number
  attendees: number
  turnoutPercent: number
}

export type AnalyticsCell = AnalyticsBreakdown & {
  region: string
}

export type AnalyticsTrendPoint = {
  id: string
  name: string
  date: string
  total: number
  members: number
  firstTimers: number
  returningVisitors: number
}

export type AnalyticsAbsentee = {
  id: string
  member_code: string
  first_name: string
  last_name: string
  cell_name: string | null
  last_attended_at: string | null
}

export type AnalyticsReport = {
  service: {
    id: string
    name: string
    status: string
    scheduled_start_at: string
  }
  summary: {
    total: number
    members: number
    first_timers: number
    returning_visitors: number
    eligible: number
    turnoutPercent: number
  }
  trend: AnalyticsTrendPoint[]
  cells: AnalyticsCell[]
  unassigned: {
    members: number
    attendees: number
  }
  departments: AnalyticsBreakdown[]
  absentees: AnalyticsAbsentee[]
  latestSunday: {
    id: string
    name: string
    date: string
  } | null
}

function isoDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function number(value: unknown): number {
  return Number(value ?? 0)
}

export async function analyticsReport(
  db: AnalyticsDb,
  serviceId: string
): Promise<AnalyticsReport | null> {
  const summary = await dashboardSummary(db, serviceId)
  if (!summary) return null

  const [trendResult, cellsResult, unassignedResult, departmentsResult, absenteesResult] =
    await Promise.all([
      db.query(
        `SELECT s.id,s.name,s.scheduled_start_at,
          count(a.id)::int AS total,
          count(a.id) FILTER (WHERE a.snapshot_stage='MEMBER')::int AS members,
          count(a.id) FILTER (WHERE a.snapshot_stage='FIRST_TIMER')::int AS first_timers,
          count(a.id) FILTER (WHERE a.snapshot_stage='RETURNING_VISITOR')::int AS returning_visitors
        FROM services s LEFT JOIN attendance_records a ON a.service_id=s.id
        WHERE s.category='SUNDAY_SERVICE' AND s.status='CHECKIN_CLOSED'
        GROUP BY s.id ORDER BY s.scheduled_start_at DESC LIMIT 12`
      ),
      db.query(
        `SELECT c.id,c.name,c.region,
          count(DISTINCT m.person_id)::int AS members,
          count(DISTINCT a.person_id)::int AS attendees
        FROM cells c
        LEFT JOIN cell_memberships m ON m.cell_id=c.id AND m.valid_to IS NULL
        LEFT JOIN attendance_records a ON a.person_id=m.person_id AND a.service_id=$1
        WHERE c.is_active
        GROUP BY c.id ORDER BY attendees DESC,c.name`,
        [serviceId]
      ),
      db.query(
        `SELECT count(*)::int AS members,count(a.id)::int AS attendees
        FROM people p
        LEFT JOIN attendance_records a ON a.person_id=p.id AND a.service_id=$1
        WHERE p.deleted_at IS NULL AND p.lifecycle_stage='MEMBER'
          AND NOT EXISTS (
            SELECT 1 FROM cell_memberships m
            WHERE m.person_id=p.id AND m.valid_to IS NULL
          )`,
        [serviceId]
      ),
      db.query(
        `SELECT d.id,d.name,
          count(DISTINCT pd.person_id)::int AS members,
          count(DISTINCT a.person_id)::int AS attendees
        FROM departments d
        LEFT JOIN person_departments pd ON pd.department_id=d.id AND pd.valid_to IS NULL
        LEFT JOIN attendance_records a ON a.person_id=pd.person_id AND a.service_id=$1
        WHERE d.is_active
        GROUP BY d.id ORDER BY attendees DESC,d.name`,
        [serviceId]
      ),
      db.query(
        `WITH latest AS (
          SELECT id,checkin_opens_at FROM services
          WHERE category='SUNDAY_SERVICE' AND status='CHECKIN_CLOSED'
          ORDER BY scheduled_start_at DESC LIMIT 1
        )
        SELECT p.id,p.member_code,p.first_name,p.last_name,c.name AS cell_name,
          (SELECT max(checked_in_at) FROM attendance_records WHERE person_id=p.id) AS last_attended_at
        FROM latest l
        JOIN people p ON p.lifecycle_stage='MEMBER' AND p.deleted_at IS NULL
          AND p.registered_at <= l.checkin_opens_at
        LEFT JOIN cell_memberships m ON m.person_id=p.id AND m.valid_to IS NULL
        LEFT JOIN cells c ON c.id=m.cell_id
        WHERE NOT EXISTS (
          SELECT 1 FROM attendance_records a
          WHERE a.service_id=l.id AND a.person_id=p.id
        )
        ORDER BY c.name NULLS FIRST,p.last_name,p.first_name`
      ),
    ])

  const trend: AnalyticsTrendPoint[] = trendResult.rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      date: isoDate(row.scheduled_start_at),
      total: number(row.total),
      members: number(row.members),
      firstTimers: number(row.first_timers),
      returningVisitors: number(row.returning_visitors),
    }))
    .reverse()

  const cells: AnalyticsCell[] = cellsResult.rows.map((row) => ({
    id: row.id,
    name: row.name,
    region: row.region,
    members: number(row.members),
    attendees: number(row.attendees),
    turnoutPercent: turnoutPercent(number(row.attendees), number(row.members)),
  }))

  const departments: AnalyticsBreakdown[] = departmentsResult.rows.map(
    (row) => ({
      id: row.id,
      name: row.name,
      members: number(row.members),
      attendees: number(row.attendees),
      turnoutPercent: turnoutPercent(number(row.attendees), number(row.members)),
    })
  )

  const unassignedRow = unassignedResult.rows[0]
  const absentees: AnalyticsAbsentee[] = absenteesResult.rows.map((row) => ({
    id: row.id,
    member_code: row.member_code,
    first_name: row.first_name,
    last_name: row.last_name,
    cell_name: row.cell_name ?? null,
    last_attended_at: row.last_attended_at
      ? isoDate(row.last_attended_at)
      : null,
  }))

  const latest = trend.at(-1)

  return {
    service: {
      id: summary.id,
      name: summary.name,
      status: summary.status,
      scheduled_start_at: isoDate(summary.scheduled_start_at),
    },
    summary: {
      total: number(summary.total),
      members: number(summary.members),
      first_timers: number(summary.first_timers),
      returning_visitors: number(summary.returning_visitors),
      eligible: number(summary.eligible),
      turnoutPercent: number(summary.turnoutPercent),
    },
    trend,
    cells,
    unassigned: {
      members: number(unassignedRow?.members),
      attendees: number(unassignedRow?.attendees),
    },
    departments,
    absentees,
    latestSunday: latest
      ? { id: latest.id, name: latest.name, date: latest.date }
      : null,
  }
}
