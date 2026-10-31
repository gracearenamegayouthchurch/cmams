import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashPassword, signSession } from './auth.js'

const mocked = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }))
vi.mock('./db.js', () => ({ getDb: () => mocked }))
import { handleApi } from './app.js'

const secret = 'a'.repeat(64)
const previousSecret = process.env.SESSION_SECRET
afterEach(() => {
  process.env.SESSION_SECRET = previousSecret
})

describe('API boundary', () => {
  it('lets an assigned leader update their cell location but not its name', async () => {
    process.env.SESSION_SECRET = secret
    const cellId = '11111111-1111-4111-8111-111111111111'
    mocked.query.mockResolvedValue({ rows: [{ id: 'staff', full_name: 'Leader', email: 'leader@example.org', role: 'CELL_LEADER', session_version: 0 }] })
    const statements: string[] = []
    mocked.connect.mockResolvedValue({
      query: async (sql: string) => {
        statements.push(sql)
        if (sql.startsWith('SELECT id FROM cells')) return { rows: [{ id: cellId }] }
        if (sql.includes('FROM cell_leader_assignments')) return { rows: [{ cell_id: cellId }] }
        if (sql.startsWith('UPDATE cells')) return { rows: [{ id: cellId, meeting_location: 'Hall B' }] }
        return { rows: [] }
      }, release: () => {},
    })
    const token = signSession({ id: 'staff', role: 'CELL_LEADER' }, secret)
    const headers = { origin: 'https://church.example', 'content-type': 'application/json', cookie: `cmams_session=${token}` }
    const url = `https://church.example/api/v1/cells/${cellId}/location`
    const result = await handleApi(new Request(url, { method: 'PATCH', headers, body: JSON.stringify({ location: 'Hall B' }) }))
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ cell: { meeting_location: 'Hall B' } })
    const denied = await handleApi(new Request(url, { method: 'PATCH', headers, body: JSON.stringify({ location: 'Hall B', name: 'Stolen' }) }))
    expect(denied.status).toBe(400)
    expect(statements.filter((sql) => sql.startsWith('UPDATE cells'))).toHaveLength(1)
  })
  it('never exposes a different cell member list to a cell leader', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM staff_users WHERE id=')
      ? [{ id: 'staff', full_name: 'Leader', email: 'leader@example.org', role: 'CELL_LEADER', session_version: 0 }]
      : [] }))
    const token = signSession({ id: 'staff', role: 'CELL_LEADER' }, secret)
    const headers = { cookie: `cmams_session=${token}` }
    const result = await handleApi(new Request('https://church.example/api/v1/cells/11111111-1111-4111-8111-111111111111/members', { headers }))
    expect(result.status).toBe(403)
    expect(JSON.stringify(await result.json())).not.toContain('member_code')
    const services = await handleApi(new Request('https://church.example/api/v1/services', { headers }))
    expect(services.status).toBe(403)
  })

  it('allows registration staff to read choices but not change the catalog', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM staff_users WHERE id=')
      ? [{ id: 'staff', full_name: 'Desk', email: 'desk@example.com', role: 'REGISTRATION_DESK', session_version: 0 }]
      : [] }))
    const token = signSession({ id: 'staff', role: 'REGISTRATION_DESK' }, secret)
    const headers = { cookie: `cmams_session=${token}`, origin: 'https://church.example' }
    const list = await handleApi(new Request('https://church.example/api/v1/catalogs', { headers }))
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({
      compounds: [],
      departments: [],
      regions: [
        { code: 'ACROSS', label: 'Across' },
        { code: 'NDAR', label: 'Ndar' },
        { code: 'CHIKAM', label: 'Chikam' },
        { code: 'HOSTEL', label: 'Hostel' },
      ],
    })
    const create = await handleApi(new Request('https://church.example/api/v1/catalogs/compounds', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'North' }),
    }))
    expect(create.status).toBe(403)
  })

  it('rejects staff listing for a supervisor and shows an admin safe staff details', async () => {
    process.env.SESSION_SECRET = secret
    let actorRole: 'SERVICE_SUPERVISOR' | 'ADMIN' = 'SERVICE_SUPERVISOR'
    mocked.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM staff_users WHERE id=')
      ? [{ id: 'staff', full_name: 'Admin', email: 'admin@example.com', role: actorRole, is_active: true, session_version: 0 }]
      : [{ id: 'other', email: 'other@example.com', full_name: 'Other', role: 'REGISTRATION_DESK', is_active: true }] }))
    const supervisor = signSession({ id: 'staff', role: 'SERVICE_SUPERVISOR' }, secret)
    expect((await handleApi(new Request('https://church.example/api/v1/staff', { headers: { cookie: `cmams_session=${supervisor}` } }))).status).toBe(403)
    actorRole = 'ADMIN'
    const admin = signSession({ id: 'staff', role: 'ADMIN' }, secret)
    const response = await handleApi(new Request('https://church.example/api/v1/staff', { headers: { cookie: `cmams_session=${admin}` } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ staff: [{ email: 'other@example.com', role: 'REGISTRATION_DESK' }] })
  })

  it('blocks old sessions after a password reset or role change', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockResolvedValue({ rows: [{ id: 'staff', full_name: 'Admin', email: 'admin@example.com', role: 'ADMIN', session_version: 1 }] })
    const previous = signSession({ id: 'staff', role: 'ADMIN', version: 0 }, secret)
    expect((await handleApi(new Request('https://church.example/api/v1/session', { headers: { cookie: `cmams_session=${previous}` } }))).status).toBe(401)
  })

  it('forces a reset user to change their password before opening the directory', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockResolvedValue({ rows: [{ id: 'staff', full_name: 'Staff', email: 'staff@example.com', role: 'REGISTRATION_DESK', session_version: 0, must_change_password: true }] })
    const token = signSession({ id: 'staff', role: 'REGISTRATION_DESK' }, secret)
    const response = await handleApi(new Request('https://church.example/api/v1/people', { headers: { cookie: `cmams_session=${token}` } }))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' })
  })

  it('marks a temporary-password login as restricted without exposing the hash', async () => {
    process.env.SESSION_SECRET = secret
    const passwordHash = await hashPassword('temporary-secret-123')
    mocked.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('WHERE email=lower')
      ? [{ id: 'staff', full_name: 'New Staff', email: 'new@example.com', role: 'REGISTRATION_DESK', password_hash: passwordHash, session_version: 2, must_change_password: true }]
      : [] }))
    const response = await handleApi(new Request('https://church.example/api/v1/login', {
      method: 'POST', headers: { origin: 'https://church.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', password: 'temporary-secret-123' }),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ staff: { must_change_password: true } })
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('never creates staff from a supervisor account', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockResolvedValue({ rows: [{ id: 'staff', full_name: 'Supervisor', email: 'supervisor@example.com', role: 'SERVICE_SUPERVISOR', session_version: 0 }] })
    const token = signSession({ id: 'staff', role: 'SERVICE_SUPERVISOR' }, secret)
    const response = await handleApi(new Request('https://church.example/api/v1/staff', {
      method: 'POST', headers: { cookie: `cmams_session=${token}`, origin: 'https://church.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', fullName: 'New Staff', role: 'ADMIN' }),
    }))
    expect(response.status).toBe(403)
  })

  it('rejects deactivating the last active administrator', async () => {
    process.env.SESSION_SECRET = secret
    const id = '9ff41440-0d63-428e-ad12-039d0c244ca8'
    mocked.query.mockResolvedValue({ rows: [{ id, full_name: 'Admin', email: 'admin@example.com', role: 'ADMIN', session_version: 0 }] })
    const statements: string[] = []
    mocked.connect.mockResolvedValue({ query: async (sql: string) => {
      statements.push(sql)
      if (sql.includes('FROM staff_users WHERE id=')) return { rows: [{ id, role: 'ADMIN', is_active: true }] }
      if (sql.includes('count(*)')) return { rows: [{ count: '1' }] }
      return { rows: [] }
    }, release: () => {} })
    const token = signSession({ id, role: 'ADMIN' }, secret)
    const response = await handleApi(new Request(`https://church.example/api/v1/staff/${id}`, {
      method: 'PATCH', headers: { cookie: `cmams_session=${token}`, origin: 'https://church.example', 'content-type': 'application/json' }, body: JSON.stringify({ isActive: false }),
    }))
    expect(response.status).toBe(409)
    expect(statements.some((sql) => sql.includes('ROLLBACK'))).toBe(true)
    expect(statements.some((sql) => sql.includes('UPDATE staff_users'))).toBe(false)
  })
  it('does not reveal a session without a signed cookie', async () => {
    process.env.SESSION_SECRET = secret
    const response = await handleApi(
      new Request('https://church.example/api/v1/session')
    )
    expect(response.status).toBe(401)
  })
  it('rejects a cross-origin mutation before touching the database', async () => {
    process.env.SESSION_SECRET = secret
    const response = await handleApi(
      new Request('https://church.example/api/v1/people', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'content-type': 'application/json',
        },
        body: '{}',
      })
    )
    expect(response.status).toBe(403)
  })
  it('rejects JSON mutations with no origin', async () => {
    process.env.SESSION_SECRET = secret
    const response = await handleApi(
      new Request('https://church.example/api/v1/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    )
    expect(response.status).toBe(403)
  })
  it('registers a consenting person through the protected route', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('staff_users')
        ? [
            {
              id: 'staff',
              full_name: 'Admin',
              email: 'admin@example.com',
              role: 'ADMIN',
            },
          ]
        : [],
    }))
    mocked.connect.mockResolvedValue({
      query: async (sql: string) => ({
        rows: sql.includes('INSERT INTO people')
          ? [{ id: 'person', member_code: 'CM-1001' }]
          : sql.includes('FROM compounds WHERE normalized_name')
            ? [{ id: '11111111-1111-4111-8111-111111111111', region: 'ACROSS', is_active: true }]
            : [],
      }),
      release: () => {},
    })
    const token = signSession({ id: 'staff', role: 'ADMIN' }, secret)
    const response = await handleApi(
      new Request('https://church.example/api/v1/people', {
        method: 'POST',
        headers: {
          origin: 'https://church.example',
          'content-type': 'application/json',
          cookie: `cmams_session=${token}`,
        },
        body: JSON.stringify({
          firstName: 'Ada',
          lastName: 'Okafor',
          email: 'ada@example.org',
          region: 'ACROSS',
          compoundName: 'East Gate',
          birthMonth: 2,
          birthDay: 29,
          consent: true,
        }),
      })
    )
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      person: { member_code: 'CM-1001' },
    })
  })
  it('returns safe field-specific registration validation errors before database writes', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockResolvedValue({
      rows: [{ id: 'staff', full_name: 'Desk', email: 'desk@example.org', role: 'REGISTRATION_DESK', session_version: 0 }],
    })
    mocked.connect.mockClear()
    const token = signSession({ id: 'staff', role: 'REGISTRATION_DESK' }, secret)
    const valid = {
      firstName: 'Ada', lastName: 'Okafor', email: 'ada@example.org', region: 'ACROSS',
      compoundName: 'East Gate', birthMonth: 10, birthDay: 12, consent: true,
    }
    for (const [invalid, field] of [
      [{ phone: '08031234567' }, 'phone'],
      [{ email: 'not-an-email' }, 'email'],
      [{ birthMonth: 2, birthDay: 30 }, 'birth day'],
      [{ departmentId: 'Choir' }, 'department'],
    ] as const) {
      const response = await handleApi(new Request('https://church.example/api/v1/people', {
        method: 'POST',
        headers: { origin: 'https://church.example', 'content-type': 'application/json', cookie: `cmams_session=${token}` },
        body: JSON.stringify({ ...valid, ...invalid }),
      }))
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toMatchObject({ code: 'REGISTRATION_VALIDATION_ERROR', error: expect.stringMatching(new RegExp(field, 'i')) })
      for (const value of Object.values(invalid)) {
        if (typeof value === 'string') expect(JSON.stringify(body)).not.toContain(value)
      }
    }
    expect(mocked.connect).not.toHaveBeenCalled()
  })

  it('keeps malformed registration JSON generic', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockResolvedValue({
      rows: [{ id: 'staff', full_name: 'Desk', email: 'desk@example.org', role: 'REGISTRATION_DESK', session_version: 0 }],
    })
    const token = signSession({ id: 'staff', role: 'REGISTRATION_DESK' }, secret)
    const response = await handleApi(new Request('https://church.example/api/v1/people', {
      method: 'POST',
      headers: { origin: 'https://church.example', 'content-type': 'application/json', cookie: `cmams_session=${token}` },
      body: '{',
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid request' })
  })
  it('denies a registration desk staff member replacement of an active card', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockResolvedValue({
      rows: [
        {
          id: 'desk',
          full_name: 'Desk',
          email: 'desk@example.com',
          role: 'REGISTRATION_DESK',
        },
      ],
    })
    mocked.connect.mockResolvedValue({
      query: async (sql: string) => ({
        rows: sql.includes('FROM people')
          ? [{ id: 'person', member_code: 'CM-1001' }]
          : sql.includes('FROM qr_cards')
            ? [{ id: 'old-card' }]
            : [],
      }),
      release: () => {},
    })
    const token = signSession(
      { id: 'desk', role: 'REGISTRATION_DESK' },
      secret
    )
    const response = await handleApi(
      new Request(
        'https://church.example/api/v1/people/9ff41440-0d63-428e-ad12-039d0c244ca8/cards',
        {
          method: 'POST',
          headers: {
            origin: 'https://church.example',
            'content-type': 'application/json',
            cookie: `cmams_session=${token}`,
          },
          body: '{}',
        }
      )
    )
    expect(response.status).toBe(409)
  })
  it('lists services for a signed-in supervisor', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('staff_users')
        ? [
            {
              id: 'staff',
              full_name: 'Supervisor',
              email: 'supervisor@example.com',
              role: 'SERVICE_SUPERVISOR',
            },
          ]
        : [],
    }))
    const token = signSession(
      { id: 'staff', role: 'SERVICE_SUPERVISOR' },
      secret
    )
    const response = await handleApi(
      new Request('https://church.example/api/v1/services', {
        headers: { cookie: `cmams_session=${token}` },
      })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ services: [] })
  })
  it('creates a service for a supervisor but not for the registration desk', async () => {
    process.env.SESSION_SECRET = secret
    let role = 'SERVICE_SUPERVISOR'
    const inserts: unknown[][] = []
    mocked.query.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes('staff_users')) return { rows: [{ id: 'staff', full_name: 'Staff', email: 'staff@example.org', role, session_version: 0 }] }
      if (sql.includes('INSERT INTO services')) {
        inserts.push(values ?? [])
        return { rows: [{ id: 'service', name: 'Sunday Service', status: 'SCHEDULED' }] }
      }
      return { rows: [] }
    })
    const payload = JSON.stringify({ name: 'Sunday Service', category: 'SUNDAY_SERVICE', scheduledStartAt: '2026-11-01T08:00:00Z', opensAt: '2026-11-01T07:00:00Z', closesAt: '2026-11-01T10:00:00Z' })
    const post = (actor: 'SERVICE_SUPERVISOR' | 'REGISTRATION_DESK', body = payload) => handleApi(new Request('https://church.example/api/v1/services', {
      method: 'POST', headers: { origin: 'https://church.example', 'content-type': 'application/json', cookie: `cmams_session=${signSession({ id: 'staff', role: actor }, secret)}` }, body,
    }))
    const created = await post('SERVICE_SUPERVISOR')
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ service: { status: 'SCHEDULED' } })
    const invalid = await post('SERVICE_SUPERVISOR', JSON.stringify({ ...JSON.parse(payload), closesAt: '2026-11-01T06:00:00Z' }))
    expect(invalid.status).toBe(400)
    role = 'REGISTRATION_DESK'
    const denied = await post('REGISTRATION_DESK')
    expect(denied.status).toBe(403)
    expect(inserts).toHaveLength(1)
  })
  it('permits service edits and cancellation only for managers', async () => {
    process.env.SESSION_SECRET = secret
    let role: 'SERVICE_SUPERVISOR' | 'REGISTRATION_DESK' = 'SERVICE_SUPERVISOR'
    const statements: string[] = []
    mocked.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('staff_users')
      ? [{ id: 'staff', full_name: 'Staff', email: 'staff@example.org', role, session_version: 0 }]
      : [] }))
    mocked.connect.mockResolvedValue({ query: async (sql: string) => {
      statements.push(sql)
      return { rows: sql.includes('UPDATE services') ? [{ id: '11111111-1111-4111-8111-111111111111', status: sql.includes("'CANCELLED'") ? 'CANCELLED' : 'SCHEDULED' }] : [] }
    }, release: () => {} })
    const base = 'https://church.example/api/v1/services/11111111-1111-4111-8111-111111111111'
    const request = (url: string, method: string, body: unknown, actor: 'SERVICE_SUPERVISOR' | 'REGISTRATION_DESK') => handleApi(new Request(url, {
      method, headers: { origin: 'https://church.example', 'content-type': 'application/json', cookie: `cmams_session=${signSession({ id: 'staff', role: actor }, secret)}` }, body: JSON.stringify(body),
    }))
    const edit = { name: 'Updated service', category: 'SPECIAL_EVENT', scheduledStartAt: '2026-11-01T08:00:00Z', opensAt: '2026-11-01T07:00:00Z', closesAt: '2026-11-01T10:00:00Z' }
    expect((await request(base, 'PATCH', edit, 'SERVICE_SUPERVISOR')).status).toBe(200)
    expect((await request(`${base}/cancel`, 'POST', {}, 'SERVICE_SUPERVISOR')).status).toBe(200)
    role = 'REGISTRATION_DESK'
    expect((await request(base, 'PATCH', edit, 'REGISTRATION_DESK')).status).toBe(403)
    expect((await request(`${base}/cancel`, 'POST', {}, 'REGISTRATION_DESK')).status).toBe(403)
    expect(statements.filter((sql) => sql.includes('UPDATE services'))).toHaveLength(2)
  })
  it('lets the registration desk scan a card without permission to manage services', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('staff_users')
        ? [
            {
              id: 'staff',
              full_name: 'Desk',
              email: 'desk@example.com',
              role: 'REGISTRATION_DESK',
            },
          ]
        : [{ outcome: { outcome: 'CHECKED_IN' } }],
    }))
    const token = signSession({ id: 'staff', role: 'REGISTRATION_DESK' }, secret)
    const response = await handleApi(
      new Request(
        'https://church.example/api/v1/services/9ff41440-0d63-428e-ad12-039d0c244ca8/check-ins',
        {
          method: 'POST',
          headers: {
            origin: 'https://church.example',
            'content-type': 'application/json',
            cookie: `cmams_session=${token}`,
          },
          body: JSON.stringify({
            credential: '123-ABC',
            eventId: 'e8ee15e6-3646-4794-8405-a994c448b219',
          }),
        }
      )
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ outcome: 'CHECKED_IN' })
  })
  it('returns a service dashboard for a signed-in pastor', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('staff_users')
        ? [
            {
              id: 'staff',
              full_name: 'Pastor',
              email: 'pastor@example.com',
              role: 'PASTOR_VIEWER',
            },
          ]
        : [
            {
              id: '9ff41440-0d63-428e-ad12-039d0c244ca8',
              total: 10,
              members: 7,
              eligible: 10,
            },
          ],
    }))
    const token = signSession({ id: 'staff', role: 'PASTOR_VIEWER' }, secret)
    const response = await handleApi(
      new Request(
        'https://church.example/api/v1/dashboard?serviceId=9ff41440-0d63-428e-ad12-039d0c244ca8',
        {
          headers: { cookie: `cmams_session=${token}` },
        }
      )
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      summary: { turnoutPercent: 70 },
    })
  })
  it('issues an HttpOnly Secure SameSite=Strict cookie on HTTPS login without leaking password_hash', async () => {
    process.env.SESSION_SECRET = secret
    const passwordHash = await hashPassword('a-secure-staff-password')
    mocked.query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith('SELECT id,full_name')
        ? [
            {
              id: 'staff',
              full_name: 'Admin',
              email: 'admin@example.com',
              role: 'ADMIN',
              password_hash: passwordHash,
            },
          ]
        : [],
    }))
    const response = await handleApi(
      new Request('https://church.example/api/v1/login', {
        method: 'POST',
        headers: {
          origin: 'https://church.example',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'a-secure-staff-password',
        }),
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain(
      'HttpOnly; Secure; SameSite=Strict'
    )
    const body = (await response.json()) as { staff: Record<string, unknown> }
    expect(body.staff).not.toHaveProperty('password_hash')
  })
  it('audits absentee CSV exports and denies export to registration desk staff', async () => {
    process.env.SESSION_SECRET = secret
    const deskToken = signSession(
      { id: 'desk', role: 'REGISTRATION_DESK' },
      secret
    )
    mocked.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'desk',
          full_name: 'Desk',
          email: 'desk@example.com',
          role: 'REGISTRATION_DESK',
        },
      ],
    })
    const denied = await handleApi(
      new Request('https://church.example/api/v1/reports/absentees.csv', {
        headers: { cookie: `cmams_session=${deskToken}` },
      })
    )
    expect(denied.status).toBe(403)

    const adminToken = signSession({ id: 'admin', role: 'ADMIN' }, secret)
    const queries: string[] = []
    mocked.query.mockImplementation(async (sql: string) => {
      queries.push(sql)
      if (sql.includes('staff_users'))
        return {
          rows: [
            {
              id: 'admin',
              full_name: 'Admin',
              email: 'admin@example.com',
              role: 'ADMIN',
            },
          ],
        }
      return {
        rows: [
          {
            member_code: 'CM-1001',
            first_name: 'Ada',
            last_name: 'Okafor',
            phone_e164: '+2348031234592',
            last_attended_at: null,
          },
        ],
      }
    })
    const exported = await handleApi(
      new Request(
        'https://church.example/api/v1/reports/absentees.csv?count=4',
        {
          headers: { cookie: `cmams_session=${adminToken}` },
        }
      )
    )
    expect(exported.status).toBe(200)
    expect(exported.headers.get('content-type')).toContain('text/csv')
    expect(await exported.text()).toContain('CM-1001')
    expect(queries.some((sql) => sql.includes('INSERT INTO audit_logs'))).toBe(
      true
    )
  })
  it('returns paginated members and individual attendance history for a pastor', async () => {
    process.env.SESSION_SECRET = secret
    const pastorToken = signSession(
      { id: 'pastor', role: 'PASTOR_VIEWER' },
      secret
    )
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes('staff_users'))
        return {
          rows: [
            {
              id: 'pastor',
              full_name: 'Pastor',
              email: 'pastor@example.com',
              role: 'PASTOR_VIEWER',
            },
          ],
        }
      if (sql.includes('total_count'))
        return {
          rows: [
            {
              id: '9ff41440-0d63-428e-ad12-039d0c244ca8',
              member_code: 'CM-1001',
              first_name: 'Ada',
              last_name: 'Okafor',
              phone_e164: '+2348031234592',
              lifecycle_stage: 'MEMBER',
              registered_at: '2026-09-01T08:00:00Z',
              attendance_count: 2,
              last_attended_at: '2026-10-25T08:05:00Z',
              total_count: 1,
            },
          ],
        }
      if (sql.includes('JOIN services s'))
        return {
          rows: [
            {
              id: 'att-1',
              service_id: 'svc-1',
              checked_in_at: '2026-10-25T08:05:00Z',
              checkin_method: 'QR_CAMERA',
              snapshot_stage: 'MEMBER',
              service_name: 'Sunday Service',
              service_category: 'SUNDAY_SERVICE',
              scheduled_start_at: '2026-10-25T08:00:00Z',
            },
          ],
        }
      return {
        rows: [
          {
            id: '9ff41440-0d63-428e-ad12-039d0c244ca8',
            member_code: 'CM-1001',
            first_name: 'Ada',
            last_name: 'Okafor',
            phone_e164: '+2348031234592',
            lifecycle_stage: 'MEMBER',
            registered_at: '2026-09-01T08:00:00Z',
          },
        ],
      }
    })
    const listRes = await handleApi(
      new Request(
        'https://church.example/api/v1/people?page=1&pageSize=15&stage=MEMBER',
        {
          headers: { cookie: `cmams_session=${pastorToken}` },
        }
      )
    )
    expect(listRes.status).toBe(200)
    expect(await listRes.json()).toMatchObject({
      total: 1,
      page: 1,
      totalPages: 1,
      people: [{ member_code: 'CM-1001', attendance_count: 2 }],
    })

    const histRes = await handleApi(
      new Request(
        'https://church.example/api/v1/people/9ff41440-0d63-428e-ad12-039d0c244ca8/attendance',
        {
          headers: { cookie: `cmams_session=${pastorToken}` },
        }
      )
    )
    expect(histRes.status).toBe(200)
    expect(await histRes.json()).toMatchObject({
      person: { member_code: 'CM-1001', phone: '+234803*****92' },
      history: [
        { service_name: 'Sunday Service', checkin_method: 'QR_CAMERA' },
      ],
    })
  })

  it('serves attendance analytics to an admin', async () => {
    process.env.SESSION_SECRET = secret
    const serviceId = '9ff41440-0d63-428e-ad12-039d0c244ca8'
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM staff_users WHERE id='))
        return {
          rows: [
            {
              id: 'staff',
              full_name: 'Admin',
              email: 'admin@example.com',
              role: 'ADMIN',
              session_version: 0,
            },
          ],
        }
      if (sql.includes('WHERE s.id=$1 GROUP BY s.id'))
        return {
          rows: [
            {
              id: serviceId,
              name: 'Sunday Service',
              status: 'CHECKIN_CLOSED',
              scheduled_start_at: new Date('2026-10-25T08:00:00.000Z'),
              total: 10,
              members: 7,
              first_timers: 2,
              returning_visitors: 1,
              eligible: 14,
            },
          ],
        }
      if (sql.includes('FROM people p') && sql.includes('NOT EXISTS'))
        return { rows: [{ members: 0, attendees: 0 }] }
      return { rows: [] }
    })
    const token = signSession({ id: 'staff', role: 'ADMIN' }, secret)
    const response = await handleApi(
      new Request(
        `https://church.example/api/v1/analytics?serviceId=${serviceId}`,
        { headers: { cookie: `cmams_session=${token}` } }
      )
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      service: { id: serviceId, name: 'Sunday Service' },
      summary: { total: 10, members: 7, turnoutPercent: 50 },
      trend: [],
      cells: [],
      departments: [],
      absentees: [],
    })
  })

  it('denies attendance analytics to a cell leader', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockResolvedValue({
      rows: [
        {
          id: 'staff',
          full_name: 'Leader',
          email: 'leader@example.com',
          role: 'CELL_LEADER',
          session_version: 0,
        },
      ],
    })
    const token = signSession({ id: 'staff', role: 'CELL_LEADER' }, secret)
    const response = await handleApi(
      new Request(
        'https://church.example/api/v1/analytics?serviceId=9ff41440-0d63-428e-ad12-039d0c244ca8',
        { headers: { cookie: `cmams_session=${token}` } }
      )
    )
    expect(response.status).toBe(403)
  })
})
