import { hashPassword } from './auth'

type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

export async function createFirstAdmin(db: Queryable, email: string, fullName: string, password: string) {
  const current = await db.query("SELECT count(*) FROM staff_users WHERE role='ADMIN'")
  if (Number(current.rows[0]?.count) > 0) throw new Error('An administrator already exists')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName.trim()) throw new Error('A valid email and name are required')
  const passwordHash = await hashPassword(password)
  await db.query('INSERT INTO staff_users(email,full_name,password_hash,role) VALUES(lower($1),$2,$3,\'ADMIN\')', [email, fullName.trim(), passwordHash])
}
