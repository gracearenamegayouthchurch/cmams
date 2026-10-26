import pg from 'pg'

let pool: pg.Pool | undefined

/** Server-side only. The database password must never appear in Vite environment variables. */
export function getDb(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured')
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 })
  return pool
}
