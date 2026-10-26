import { readFile } from 'node:fs/promises'
import { getDb } from '../server/db.js'
import { assertChurchDatabase } from '../server/database-target.js'

try { process.loadEnvFile('.env.local') } catch { /* optional local env file */ }

const projectRef = 'dyngikqhjxqprjhvrscz'
let db: ReturnType<typeof getDb> | undefined
if (process.argv[2] !== `--confirm-project=${projectRef}`) {
  process.stderr.write(`Refusing migration. Supply --confirm-project=${projectRef} after reviewing the target.\n`)
  process.exitCode = 1
} else {
  try {
    assertChurchDatabase(process.env.DATABASE_URL ?? '', projectRef)
    const sql = await readFile(new URL('../supabase/migrations/001_cmams.sql', import.meta.url), 'utf8')
    db = getDb()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query("SELECT to_regclass('public.people') AS people, to_regclass('public.staff_users') AS staff")
      if (existing.rows[0].people || existing.rows[0].staff) throw new Error('Existing CMAMS tables found; migration is only for a fresh church database')
      await client.query(sql)
      await client.query('COMMIT')
      process.stdout.write(`Migration applied to approved project ${projectRef}.\n`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Migration failed'}\n`)
    process.exitCode = 1
  } finally { await db?.end() }
}
