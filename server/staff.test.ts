import { expect, it } from 'vitest'
import { verifyPassword, hashPassword } from './auth.js'
import { changeOwnPassword, createStaff, resetStaffPassword, updateStaff, validateNewStaff } from './staff.js'

it('validates one of the five staff roles before opening a transaction', () => {
  expect(() => validateNewStaff({ email: 'u@example.com', fullName: 'Desk Example', role: 'OWNER' })).toThrow()
  expect(() => validateNewStaff({ email: 'u@example.com', fullName: 'Desk Example', role: 'USHER_SCANNER' })).toThrow()
})

it('creates a staff account with a random one-time password and an audit record, never audit-log plaintext', async () => {
  const calls: { sql: string; args?: unknown[] }[] = []
  let storedHash = ''
  const client = { query: async (sql: string, args?: unknown[]) => {
    calls.push({ sql, args })
    if (sql.includes('INSERT INTO staff_users')) { storedHash = String(args?.[2]); return { rows: [{ id: 'new', email: 'new@example.com', role: 'REGISTRATION_DESK' }] } }
    return { rows: [] }
  }, release: () => {} }
  const result = await createStaff({ connect: async () => client } as never, { email: 'new@example.com', fullName: 'New Staff', role: 'REGISTRATION_DESK' }, 'admin')
  expect(result.temporaryPassword).toHaveLength(32)
  expect(result.staff).not.toHaveProperty('password_hash')
  expect(await verifyPassword(result.temporaryPassword, storedHash)).toBe(true)
  expect(calls.some((call) => call.sql.includes('INSERT INTO audit_logs'))).toBe(true)
  expect(calls.find((call) => call.sql.includes('STAFF_CREATED'))?.sql).toContain("jsonb_build_object('role',$3::text)")
  expect(calls.filter((call) => call.sql.includes('audit_logs')).flatMap((call) => call.args ?? [])).not.toContain(result.temporaryPassword)
})

it('types role and active-state parameters when auditing a staff update', async () => {
  const queries: string[] = []
  const db = { connect: async () => ({
    query: async (sql: string) => {
      queries.push(sql)
      if (sql.includes('SELECT id,role,is_active')) return { rows: [{ id: 'staff', role: 'PASTOR_VIEWER', is_active: true }] }
      if (sql.includes('UPDATE staff_users')) return { rows: [{ id: 'staff', role: 'PASTOR_VIEWER', is_active: false }] }
      return { rows: [] }
    }, release: () => {},
  }) }
  await updateStaff(db as never, 'staff', { isActive: false }, 'admin')
  const audit = queries.find((sql) => sql.includes('STAFF_UPDATED'))
  expect(audit).toContain("jsonb_build_object('role',$3::text,'active',$4::boolean)")
  expect(audit).toContain("jsonb_build_object('role',$5::text,'active',$6::boolean)")
})

it('rolls back duplicate staff email errors', async () => {
  const queries: string[] = []
  const client = { query: async (sql: string) => { queries.push(sql); if (sql.includes('INSERT INTO staff_users')) throw Object.assign(new Error('duplicate'), { code: '23505' }); return { rows: [] } }, release: () => {} }
  await expect(createStaff({ connect: async () => client } as never, { email: 'new@example.com', fullName: 'New Staff', role: 'ADMIN' }, 'admin')).rejects.toMatchObject({ status: 409 })
  expect(queries).toContain('ROLLBACK')
})

it('serializes admin changes and refuses to demote the last active admin without updating', async () => {
  const queries: string[] = []
  const client = { query: async (sql: string) => {
    queries.push(sql)
    if (sql.includes('FOR UPDATE')) return { rows: [{ id: 'admin', role: 'ADMIN', is_active: true }] }
    if (sql.includes('count(*)')) return { rows: [{ count: '1' }] }
    return { rows: [] }
  }, release: () => {} }
  await expect(updateStaff({ connect: async () => client } as never, 'admin', { role: 'REGISTRATION_DESK' }, 'admin')).rejects.toMatchObject({ status: 409 })
  expect(queries.some((sql) => sql.includes('pg_advisory_xact_lock'))).toBe(true)
  expect(queries).not.toContain(expect.stringContaining('UPDATE staff_users'))
})

it('resets a password and increments the session version without returning a password hash', async () => {
  const queries: string[] = []
  const client = { query: async (sql: string) => { queries.push(sql); return { rows: sql.includes('UPDATE staff_users') ? [{ id: 'person' }] : [] } }, release: () => {} }
  const result = await resetStaffPassword({ connect: async () => client } as never, 'person', 'admin')
  expect(result.temporaryPassword).toHaveLength(32)
  expect(queries.some((sql) => sql.includes('session_version=session_version+1'))).toBe(true)
  expect(result).not.toHaveProperty('password_hash')
})

it('requires the current password before allowing a password change', async () => {
  const queries: string[] = []
  const hash = await hashPassword('existing-password-123')
  const client = { query: async (sql: string) => {
    queries.push(sql)
    return { rows: sql.includes('SELECT password_hash') ? [{ password_hash: hash, session_version: 0 }] : [] }
  }, release: () => {} }
  await expect(changeOwnPassword({ connect: async () => client } as never, 'person', 'wrong-password', 'new-long-password')).rejects.toMatchObject({ status: 403 })
  expect(queries.some((sql) => sql.includes('UPDATE staff_users'))).toBe(false)
})

it('rotates the current password, clears forced change and invalidates old sessions', async () => {
  const previous = await hashPassword('existing-password-123')
  let newHash = ''
  const queries: string[] = []
  const client = { query: async (sql: string, args?: unknown[]) => {
    queries.push(sql)
    if (sql.includes('SELECT password_hash')) return { rows: [{ password_hash: previous, session_version: 0 }] }
    if (sql.includes('UPDATE staff_users')) { newHash = String(args?.[1]); return { rows: [{ session_version: 1 }] } }
    return { rows: [] }
  }, release: () => {} }
  const version = await changeOwnPassword({ connect: async () => client } as never, 'person', 'existing-password-123', 'new-secret-password-456')
  expect(version).toBe(1)
  expect(await verifyPassword('new-secret-password-456', newHash)).toBe(true)
  expect(queries.some((sql) => sql.includes('must_change_password=false'))).toBe(true)
  expect(queries.some((sql) => sql.includes('INSERT INTO audit_logs'))).toBe(true)
})
