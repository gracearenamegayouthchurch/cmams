import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashPassword, signSession } from './auth.js'

const mocked = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }))
vi.mock('./db.js', () => ({ getDb: () => mocked }))
import { handleApi } from './app.js'

const secret = 'a'.repeat(64)
const previousSecret = process.env.SESSION_SECRET
afterEach(() => { process.env.SESSION_SECRET = previousSecret })

describe('API boundary', () => {
  it('does not reveal a session without a signed cookie', async () => {
    process.env.SESSION_SECRET = secret
    const response = await handleApi(new Request('https://church.example/api/v1/session'))
    expect(response.status).toBe(401)
  })
  it('rejects a cross-origin mutation before touching the database', async () => {
    process.env.SESSION_SECRET = secret
    const response = await handleApi(new Request('https://church.example/api/v1/people', {
      method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: '{}',
    }))
    expect(response.status).toBe(403)
  })
  it('rejects JSON mutations with no origin', async () => {
    process.env.SESSION_SECRET = secret
    const response = await handleApi(new Request('https://church.example/api/v1/people', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }))
    expect(response.status).toBe(403)
  })
  it('registers a consenting person through the protected route', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('staff_users')
      ? [{ id: 'staff', full_name: 'Admin', email: 'admin@example.com', role: 'ADMIN' }] : [] }))
    mocked.connect.mockResolvedValue({
      query: async (sql: string) => ({ rows: sql.includes('INSERT INTO people') ? [{ id: 'person', member_code: 'CM-1001' }] : [] }),
      release: () => {},
    })
    const token = signSession({ id: 'staff', role: 'ADMIN' }, secret)
    const response = await handleApi(new Request('https://church.example/api/v1/people', {
      method: 'POST', headers: { origin: 'https://church.example', 'content-type': 'application/json', cookie: `cmams_session=${token}` },
      body: JSON.stringify({ firstName: 'Ada', lastName: 'Okafor', consent: true }),
    }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ person: { member_code: 'CM-1001' } })
  })
  it('denies a registration desk staff member replacement of an active card', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockResolvedValue({ rows: [{ id: 'desk', full_name: 'Desk', email: 'desk@example.com', role: 'REGISTRATION_DESK' }] })
    mocked.connect.mockResolvedValue({ query: async (sql: string) => ({ rows: sql.includes('FROM people') ? [{ id: 'person', member_code: 'CM-1001' }] : sql.includes('FROM qr_cards') ? [{ id: 'old-card' }] : [] }), release: () => {} })
    const token = signSession({ id: 'desk', role: 'REGISTRATION_DESK' }, secret)
    const response = await handleApi(new Request('https://church.example/api/v1/people/9ff41440-0d63-428e-ad12-039d0c244ca8/cards', {
      method: 'POST', headers: { origin: 'https://church.example', 'content-type': 'application/json', cookie: `cmams_session=${token}` }, body: '{}',
    }))
    expect(response.status).toBe(409)
  })
  it('lists services for a signed-in supervisor', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('staff_users')
      ? [{ id: 'staff', full_name: 'Supervisor', email: 'supervisor@example.com', role: 'SERVICE_SUPERVISOR' }] : [] }))
    const token = signSession({ id: 'staff', role: 'SERVICE_SUPERVISOR' }, secret)
    const response = await handleApi(new Request('https://church.example/api/v1/services', { headers: { cookie: `cmams_session=${token}` } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ services: [] })
  })
  it('lets an usher scan a card without permission to manage services', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('staff_users')
      ? [{ id: 'staff', full_name: 'Usher', email: 'usher@example.com', role: 'USHER_SCANNER' }]
      : [{ outcome: { outcome: 'CHECKED_IN' } }] }))
    const token = signSession({ id: 'staff', role: 'USHER_SCANNER' }, secret)
    const response = await handleApi(new Request('https://church.example/api/v1/services/9ff41440-0d63-428e-ad12-039d0c244ca8/check-ins', {
      method: 'POST', headers: { origin: 'https://church.example', 'content-type': 'application/json', cookie: `cmams_session=${token}` },
      body: JSON.stringify({ credential: '123-ABC', eventId: 'e8ee15e6-3646-4794-8405-a994c448b219' }),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ outcome: 'CHECKED_IN' })
  })
  it('returns a service dashboard for a signed-in pastor', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('staff_users')
      ? [{ id: 'staff', full_name: 'Pastor', email: 'pastor@example.com', role: 'PASTOR_VIEWER' }]
      : [{ id: '9ff41440-0d63-428e-ad12-039d0c244ca8', total: 10, members: 7, eligible: 10 }] }))
    const token = signSession({ id: 'staff', role: 'PASTOR_VIEWER' }, secret)
    const response = await handleApi(new Request('https://church.example/api/v1/dashboard?serviceId=9ff41440-0d63-428e-ad12-039d0c244ca8', {
      headers: { cookie: `cmams_session=${token}` },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ summary: { turnoutPercent: 70 } })
  })
  it('issues an HttpOnly Secure SameSite=Strict cookie on HTTPS login without leaking password_hash', async () => {
    process.env.SESSION_SECRET = secret
    const passwordHash = await hashPassword('a-secure-staff-password')
    mocked.query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith('SELECT id,full_name')
        ? [{ id: 'staff', full_name: 'Admin', email: 'admin@example.com', role: 'ADMIN', password_hash: passwordHash }]
        : [],
    }))
    const response = await handleApi(new Request('https://church.example/api/v1/login', {
      method: 'POST',
      headers: { origin: 'https://church.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'a-secure-staff-password' }),
    }))
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict')
    const body = await response.json() as { staff: Record<string, unknown> }
    expect(body.staff).not.toHaveProperty('password_hash')
  })
  it('audits absentee CSV exports and denies export to registration desk staff', async () => {
    process.env.SESSION_SECRET = secret
    const deskToken = signSession({ id: 'desk', role: 'REGISTRATION_DESK' }, secret)
    mocked.query.mockResolvedValueOnce({ rows: [{ id: 'desk', full_name: 'Desk', email: 'desk@example.com', role: 'REGISTRATION_DESK' }] })
    const denied = await handleApi(new Request('https://church.example/api/v1/reports/absentees.csv', {
      headers: { cookie: `cmams_session=${deskToken}` },
    }))
    expect(denied.status).toBe(403)

    const adminToken = signSession({ id: 'admin', role: 'ADMIN' }, secret)
    const queries: string[] = []
    mocked.query.mockImplementation(async (sql: string) => {
      queries.push(sql)
      if (sql.includes('staff_users')) return { rows: [{ id: 'admin', full_name: 'Admin', email: 'admin@example.com', role: 'ADMIN' }] }
      return { rows: [{ member_code: 'CM-1001', first_name: 'Ada', last_name: 'Okafor', phone_e164: '+2348031234592', last_attended_at: null }] }
    })
    const exported = await handleApi(new Request('https://church.example/api/v1/reports/absentees.csv?count=4', {
      headers: { cookie: `cmams_session=${adminToken}` },
    }))
    expect(exported.status).toBe(200)
    expect(exported.headers.get('content-type')).toContain('text/csv')
    expect(await exported.text()).toContain('CM-1001')
    expect(queries.some((sql) => sql.includes('INSERT INTO audit_logs'))).toBe(true)
  })
})
