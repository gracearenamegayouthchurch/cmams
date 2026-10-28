import { readFile } from 'node:fs/promises'
import { getDb } from '../server/db.js'
import { assertChurchDatabase } from '../server/database-target.js'

try { process.loadEnvFile('.env.local') } catch { /* optional local env file */ }

const ref = 'dyngikqhjxqprjhvrscz'
if (process.argv[2] !== `--confirm-project=${ref}`) {
  process.stderr.write(`Refusing first-timer membership migration. Supply --confirm-project=${ref} after reviewing the target.\n`)
  process.exitCode = 1
} else {
  let db: ReturnType<typeof getDb> | undefined
  try {
    assertChurchDatabase(process.env.DATABASE_URL ?? '', ref)
    db = getDb()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const trigger = await client.query(`SELECT 1 FROM pg_trigger
        WHERE tgname='promote_first_timer_after_two_attendances' AND NOT tgisinternal`)
      if (trigger.rows.length) throw new Error('First-timer membership migration already applied or partially applied; no changes made')
      const sql = await readFile(new URL('../supabase/migrations/008_first_timer_membership.sql', import.meta.url), 'utf8')
      await client.query(sql)
      await client.query('COMMIT')
      process.stdout.write(`First-timer membership migration applied to approved project ${ref}.\n`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'First-timer membership migration failed'}\n`)
    process.exitCode = 1
  } finally { await db?.end() }
}
