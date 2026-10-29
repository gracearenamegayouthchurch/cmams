import { readFile } from 'node:fs/promises'
import { getDb } from '../server/db.js'
import { assertChurchDatabase } from '../server/database-target.js'

try { process.loadEnvFile('.env.local') } catch { /* optional local env file */ }

const ref = 'dyngikqhjxqprjhvrscz'
if (process.argv[2] !== `--confirm-project=${ref}`) {
  process.stderr.write(`Refusing staff person link migration. Supply --confirm-project=${ref} after reviewing the target.\n`)
  process.exitCode = 1
} else {
  let db: ReturnType<typeof getDb> | undefined
  try {
    assertChurchDatabase(process.env.DATABASE_URL ?? '', ref)
    db = getDb()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const col = await client.query(`SELECT 1 FROM information_schema.columns
        WHERE table_name='staff_users' AND column_name='person_id'`)
      if (col.rows.length) throw new Error('Staff person link migration already applied or partially applied; no changes made')
      const sql = await readFile(new URL('../supabase/migrations/009_staff_person_link.sql', import.meta.url), 'utf8')
      await client.query(sql)
      await client.query('COMMIT')
      process.stdout.write(`Staff person link migration applied to approved project ${ref}.\n`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Staff person link migration failed'}\n`)
    process.exitCode = 1
  } finally { await db?.end() }
}
