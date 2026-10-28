import type pg from 'pg'

export function turnoutPercent(attendees: number, eligible: number) {
  return eligible > 0 ? Math.min(100, Math.round(attendees * 1000 / eligible) / 10) : 0
}

export function csvCell(value: unknown): string {
  const text = String(value ?? '')
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function csvRows(rows: Record<string, unknown>[], columns: string[]): string {
  return '\uFEFF' + [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n') + '\r\n'
}

export async function dashboardSummary(db: Pick<pg.Pool, 'query'>, serviceId: string) {
  const result = await db.query(`SELECT s.id,s.name,s.status,s.scheduled_start_at,
    count(a.id)::int AS total,
    count(a.id) FILTER (WHERE a.snapshot_stage='MEMBER' AND p.registered_at <= s.checkin_opens_at)::int AS members,
    count(a.id) FILTER (WHERE a.snapshot_stage='FIRST_TIMER')::int AS first_timers,
    count(a.id) FILTER (WHERE a.snapshot_stage='RETURNING_VISITOR')::int AS returning_visitors,
    coalesce(s.locked_eligible_member_count, (
      SELECT count(*)::int FROM people m WHERE m.lifecycle_stage='MEMBER' AND m.deleted_at IS NULL
        AND m.registered_at <= s.checkin_opens_at)) AS eligible
    FROM services s LEFT JOIN attendance_records a ON a.service_id=s.id
    LEFT JOIN people p ON p.id=a.person_id WHERE s.id=$1 GROUP BY s.id`, [serviceId])
  const row = result.rows[0]
  if (!row) return null
  return { ...row, turnoutPercent: turnoutPercent(Number(row.members), Number(row.eligible)) }
}

export async function absenteeList(db: Pick<pg.Pool, 'query'>, consecutive = 2) {
  const result = await db.query(`WITH recent AS (
    SELECT id,scheduled_start_at FROM services WHERE category='SUNDAY_SERVICE' AND status='CHECKIN_CLOSED'
    ORDER BY scheduled_start_at DESC LIMIT $1
  ) SELECT p.id,p.member_code,p.first_name,p.last_name,p.phone_e164,
    (SELECT max(checked_in_at) FROM attendance_records WHERE person_id=p.id) last_attended_at
    FROM people p WHERE (SELECT count(*) FROM recent)=$1
      AND p.lifecycle_stage IN ('MEMBER','REGULAR_ATTENDEE') AND p.deleted_at IS NULL
      AND p.registered_at < (SELECT min(scheduled_start_at) FROM recent)
      AND NOT EXISTS (SELECT 1 FROM attendance_records a JOIN recent r ON r.id=a.service_id WHERE a.person_id=p.id)
    ORDER BY last_attended_at ASC NULLS FIRST`, [consecutive])
  return result.rows
}

export async function attendanceList(db: Pick<pg.Pool, 'query'>, serviceId: string) {
  const result = await db.query(`SELECT p.member_code,p.first_name,p.last_name,
    a.checked_in_at,a.checkin_method,a.snapshot_stage FROM attendance_records a
    JOIN people p ON p.id=a.person_id WHERE a.service_id=$1 ORDER BY a.checked_in_at`, [serviceId])
  return result.rows
}

export async function auditExport(db: Pick<pg.Pool, 'query'>, staffId: string, name: string, serviceId?: string) {
  await db.query(`INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
    VALUES($1,$2,'report',$3)`, [staffId, name, serviceId ?? '00000000-0000-0000-0000-000000000000'])
}
