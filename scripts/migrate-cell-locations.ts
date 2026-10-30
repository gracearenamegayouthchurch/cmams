import { readFile } from 'node:fs/promises'
import { getDb } from '../server/db.js'
import { assertChurchDatabase } from '../server/database-target.js'

const projectRef = 'dyngikqhjxqprjhvrscz'
if (process.argv[2] !== `--confirm-project=${projectRef}`) {
  process.stderr.write(`Refusing migration. Supply --confirm-project=${projectRef} after reviewing the target.\n`)
  process.exitCode = 1
} else {
  let db: ReturnType<typeof getDb> | undefined
  try {
    process.loadEnvFile(process.env.CMAMS_ENV_FILE ?? '.env.local')
    assertChurchDatabase(process.env.DATABASE_URL ?? '', projectRef)
    const sql = await readFile(new URL('../supabase/migrations/010_optional_cell_location.sql', import.meta.url), 'utf8')
    db = getDb()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      const result = await client.query(
        `SELECT name,region,meeting_location,is_active FROM cells
         WHERE name IN ('Across Region 9','Ndar Region 8') ORDER BY name`
      )
      if (result.rows.length !== 2 || result.rows.some((row) => !row.is_active)) {
        throw new Error('Cell seed verification failed; existing group may be archived')
      }
      await client.query('COMMIT')
      process.stdout.write('Optional cell locations enabled; two named cell groups verified.\n')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Migration failed'}\n`)
    process.exitCode = 1
  } finally { await db?.end() }
}
