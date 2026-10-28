import { readFile } from 'node:fs/promises'
import { getDb } from '../server/db.js'
import { assertChurchDatabase } from '../server/database-target.js'

try { process.loadEnvFile('.env.local') } catch { /* optional local env file */ }

const ref = 'dyngikqhjxqprjhvrscz'
if (process.argv[2] !== `--confirm-project=${ref}`) {
  process.stderr.write(`Refusing compound-region migration. Supply --confirm-project=${ref} after reviewing the target.\n`)
  process.exitCode = 1
} else {
  let db: ReturnType<typeof getDb> | undefined
  try {
    assertChurchDatabase(process.env.DATABASE_URL ?? '', ref)
    db = getDb()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const columns = await client.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='compounds' AND column_name IN ('region','normalized_name')`)
      if (columns.rows.some((row) => row.column_name === 'normalized_name'))
        throw new Error('Compound-region migration already applied or partially applied; no changes made')
      const sql = await readFile(new URL('../supabase/migrations/005_compound_regions.sql', import.meta.url), 'utf8')
      await client.query(sql)
      await client.query('COMMIT')
      process.stdout.write(`Compound-region migration applied to approved project ${ref}.\n`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Compound-region migration failed'}\n`)
    process.exitCode = 1
  } finally { await db?.end() }
}
