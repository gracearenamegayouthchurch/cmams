import { readFile } from 'node:fs/promises'
import { getDb } from '../server/db.js'
import { assertChurchDatabase } from '../server/database-target.js'

try { process.loadEnvFile('.env.local') } catch { /* optional local env file */ }

const ref = 'dyngikqhjxqprjhvrscz'
if (process.argv[2] !== `--confirm-project=${ref}`) {
  process.stderr.write(`Refusing remove-usher migration. Supply --confirm-project=${ref} after reviewing the target.\n`)
  process.exitCode = 1
} else {
  let db: ReturnType<typeof getDb> | undefined
  try {
    assertChurchDatabase(process.env.DATABASE_URL ?? '', ref)
    db = getDb()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const applied = await client.query("SELECT 1 FROM pg_constraint WHERE conname='staff_users_role_not_usher'")
      if (applied.rows.length) throw new Error('Remove-usher migration already applied; no changes made')
      const sql = await readFile(new URL('../supabase/migrations/006_remove_usher_role.sql', import.meta.url), 'utf8')
      await client.query(sql)
      await client.query('COMMIT')
      process.stdout.write(`Remove-usher migration applied to approved project ${ref}.\n`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Remove-usher migration failed'}\n`)
    process.exitCode = 1
  } finally { await db?.end() }
}
