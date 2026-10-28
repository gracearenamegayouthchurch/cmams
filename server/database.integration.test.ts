import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { expect, it } from 'vitest'

// Requires a separate disposable Supabase project. Never point this at the church database.
const enabled = process.env.CMAMS_TEST_DATABASE_ISOLATED === 'yes' && !!process.env.CMAMS_TEST_DATABASE_URL &&
  process.env.CMAMS_TEST_DATABASE_URL !== process.env.DATABASE_URL &&
  !process.env.CMAMS_TEST_DATABASE_URL.includes('dyngikqhjxqprjhvrscz')

it.skipIf(!enabled)('applies the migration and enforces database uniqueness atomically', async () => {
  const db = new pg.Client({ connectionString: process.env.CMAMS_TEST_DATABASE_URL })
  await db.connect()
  try {
    await db.query('BEGIN')
    expect((await db.query("SELECT to_regclass('public.people') AS existing")).rows[0].existing).toBeNull()
    await db.query(await readFile(new URL('../supabase/migrations/001_cmams.sql', import.meta.url), 'utf8'))
    await db.query(await readFile(new URL('../supabase/migrations/008_first_timer_membership.sql', import.meta.url), 'utf8'))
    const staff = (await db.query("INSERT INTO staff_users(email,full_name,password_hash,role) VALUES('test@church.invalid','Test Admin','placeholder','ADMIN') RETURNING id")).rows[0].id
    const people = (await db.query(`INSERT INTO people(first_name,last_name,phone_e164,privacy_consent_at,registered_by_staff_id)
      VALUES('Ada','Okafor','+2348031234592',now(),$1),('Bola','Okafor','+2348031234592',now(),$1) RETURNING id`, [staff])).rows
    expect(people).toHaveLength(2) // family members can share a phone
    await db.query('SAVEPOINT duplicate_card')
    await db.query("INSERT INTO qr_cards(person_id,token_hash,short_code,issued_by_staff_id) VALUES($1,$2,'ABC-123',$3)", [people[0].id, 'a'.repeat(64), staff])
    await expect(db.query("INSERT INTO qr_cards(person_id,token_hash,short_code,issued_by_staff_id) VALUES($1,$2,'ABC-124',$3)", [people[0].id, 'b'.repeat(64), staff]))
      .rejects.toMatchObject({ code: '23505' })
    await db.query('ROLLBACK TO SAVEPOINT duplicate_card')
    const service = (await db.query(`INSERT INTO services(name,scheduled_start_at,checkin_opens_at,checkin_closes_at,created_by_staff_id)
      VALUES('Sunday',now(),now()-interval '1 hour',now()+interval '1 hour',$1) RETURNING id`, [staff])).rows[0].id
    await db.query('SAVEPOINT duplicate_attendance')
    await db.query(`INSERT INTO attendance_records(service_id,person_id,idempotency_key,checkin_method,manual_reason,scanned_by_staff_id,snapshot_stage)
      VALUES($1,$2,gen_random_uuid(),'MANUAL_SEARCH','Card lost',$3,'FIRST_TIMER')`, [service, people[0].id, staff])
    await expect(db.query(`INSERT INTO attendance_records(service_id,person_id,idempotency_key,checkin_method,manual_reason,scanned_by_staff_id,snapshot_stage)
      VALUES($1,$2,gen_random_uuid(),'MANUAL_SEARCH','Card lost',$3,'FIRST_TIMER')`, [service, people[0].id, staff]))
      .rejects.toMatchObject({ code: '23505' })
    await db.query('ROLLBACK TO SAVEPOINT duplicate_attendance')

    await db.query(`INSERT INTO services(name,scheduled_start_at,checkin_opens_at,checkin_closes_at,created_by_staff_id)
      VALUES('Midweek',now(),now()-interval '1 hour',now()+interval '1 hour',$1)`, [staff])
    const thirdService = (await db.query(`INSERT INTO services(name,scheduled_start_at,checkin_opens_at,checkin_closes_at,created_by_staff_id)
      VALUES('Special event',now(),now()-interval '1 hour',now()+interval '1 hour',$1) RETURNING id`, [staff])).rows[0].id
    const attend = (serviceId: string) => db.query(
      `INSERT INTO attendance_records(service_id,person_id,idempotency_key,checkin_method,manual_reason,scanned_by_staff_id,snapshot_stage)
       VALUES($1,$2,gen_random_uuid(),'MANUAL_SEARCH','Card lost',$3,'FIRST_TIMER')`,
      [serviceId, people[0].id, staff]
    )

    await attend(service)
    expect((await db.query('SELECT lifecycle_stage FROM people WHERE id=$1', [people[0].id])).rows[0].lifecycle_stage)
      .toBe('FIRST_TIMER')
    // The second attended service is the third one created, so the promotion
    // must not depend on consecutive attendance.
    await attend(thirdService)
    expect((await db.query('SELECT lifecycle_stage FROM people WHERE id=$1', [people[0].id])).rows[0].lifecycle_stage)
      .toBe('MEMBER')
    const history = await db.query(
      `SELECT previous_stage,new_stage FROM person_stage_history WHERE person_id=$1`,
      [people[0].id]
    )
    expect(history.rows).toEqual([{ previous_stage: 'FIRST_TIMER', new_stage: 'MEMBER' }])
    expect((await db.query('SELECT lifecycle_stage FROM people WHERE id=$1', [people[1].id])).rows[0].lifecycle_stage)
      .toBe('FIRST_TIMER')
  } finally {
    await db.query('ROLLBACK')
    await db.end()
  }
}, 90_000)
