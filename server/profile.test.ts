import { afterEach, describe, expect, it, vi } from 'vitest'
import { signSession } from './auth.js'

const mocked = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }))
vi.mock('./db.js', () => ({ getDb: () => mocked }))
import { handleApi } from './app.js'

const secret = 'a'.repeat(64)
const previousSecret = process.env.SESSION_SECRET
afterEach(() => {
  process.env.SESSION_SECRET = previousSecret
  vi.clearAllMocks()
})

describe('Staff profile completion API', () => {
  it('allows any authenticated staff to view their profile and catalog choices', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM staff_users WHERE id=')) {
        return {
          rows: [
            {
              id: 'staff-1',
              full_name: 'Barnabas Silas',
              email: 'silas@example.org',
              role: 'REGISTRATION_DESK',
              session_version: 0,
              must_change_password: false,
              must_complete_profile: true,
              person_id: null,
            },
          ],
        }
      }
      if (sql.includes('FROM departments')) return { rows: [{ id: 'dept-1', name: 'Ushering' }] }
      if (sql.includes('FROM compounds')) return { rows: [{ id: 'comp-1', name: 'Zion', region: 'HOSTEL' }] }
      return { rows: [] }
    })

    const token = signSession({ id: 'staff-1', role: 'REGISTRATION_DESK', version: 0 }, secret)
    const res = await handleApi(
      new Request('https://church.example/api/v1/profile', {
        headers: { cookie: `cmams_session=${token}` },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.staff.full_name).toBe('Barnabas Silas')
    expect(data.staff.must_complete_profile).toBe(true)
    expect(data.catalogs.departments).toEqual([{ id: 'dept-1', name: 'Ushering' }])
    expect(data.catalogs.regions).toBeDefined()
  })

  it('allows staff to skip completing their profile for now', async () => {
    process.env.SESSION_SECRET = secret
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM staff_users WHERE id=')) {
        return {
          rows: [
            {
              id: 'staff-1',
              full_name: 'Barnabas Silas',
              email: 'silas@example.org',
              role: 'REGISTRATION_DESK',
              session_version: 0,
              must_change_password: false,
              must_complete_profile: true,
            },
          ],
        }
      }
      return { rows: [] }
    })

    const token = signSession({ id: 'staff-1', role: 'REGISTRATION_DESK', version: 0 }, secret)
    const res = await handleApi(
      new Request('https://church.example/api/v1/profile/skip', {
        method: 'POST',
        headers: {
          cookie: `cmams_session=${token}`,
          origin: 'https://church.example',
          'content-type': 'application/json',
        },
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mocked.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE staff_users SET must_complete_profile = false'),
      ['staff-1']
    )
  })
})
