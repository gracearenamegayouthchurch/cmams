import { z } from 'zod'
import { getDb } from './db.js'
import {
  readSession,
  signSession,
  verifyPassword,
  type Session,
} from './auth.js'
import { roles, type Capability, allow } from './rbac.js'
import {
  DuplicatePersonError,
  InvalidCatalogSelection,
  findDuplicates,
  getPersonAttendanceHistory,
  listPeoplePaginated,
  registerPerson,
} from './people.js'
import { issueCard, revokeCard, listActiveCards } from './cards.js'
import {
  changeServiceStatus,
  createService,
  listServices,
  ServiceTransitionError,
} from './services.js'
import { IdempotencyConflict, manualCheckin, scanCard } from './checkins.js'
import { createCatalogEntry, deactivateCatalogEntry, listActiveCatalogs, renameCatalogEntry } from './catalogs.js'
import { StaffError, changeOwnPassword, createStaff, listStaff, resetStaffPassword, updateStaff } from './staff.js'
import {
  absenteeList,
  attendanceList,
  auditExport,
  csvRows,
  dashboardSummary,
} from './reports.js'

const loginFields = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
})
const cookieName = 'cmams_session'

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })
}

function cookie(request: Request): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1)
}

function staffSession(request: Request): Session | null {
  const secret = process.env.SESSION_SECRET
  return secret ? readSession(cookie(request), secret) : null
}

async function currentStaff(request: Request) {
  const session = staffSession(request)
  if (!session) return null
  const result = await getDb().query(
    'SELECT id, full_name, email, role, session_version, must_change_password FROM staff_users WHERE id=$1 AND is_active',
    [session.id]
  )
  const staff = result.rows[0] as
    | { id: string; full_name: string; email: string; role: Session['role']; session_version?: number; must_change_password?: boolean }
    | undefined
  return staff && staff.role === session.role && Number(staff.session_version ?? 0) === (session.version ?? 0) ? staff : null
}

export async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method.toUpperCase()
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = request.headers.get('origin')
    if (!origin || origin !== url.origin)
      return json({ error: 'Request origin is not permitted' }, 403)
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: 'Expected JSON request' }, 415)
  }
  try {
    if (method === 'POST' && path === '/api/v1/login') {
      const body = loginFields.parse(await request.json())
      const result = await getDb().query(
        'SELECT id,full_name,email,role,password_hash,session_version,must_change_password FROM staff_users WHERE email=lower($1) AND is_active',
        [body.email]
      )
      const staff = result.rows[0] as
        | {
            id: string
            full_name: string
            email: string
            role: Session['role']
            password_hash: string
            session_version?: number
            must_change_password?: boolean
          }
        | undefined
      if (!staff || !(await verifyPassword(body.password, staff.password_hash)))
        return json({ error: 'Invalid credentials' }, 401)
      if (!roles.includes(staff.role))
        return json({ error: 'Invalid staff role' }, 403)
      const secure =
        url.protocol === 'https:' || process.env.NODE_ENV === 'production'
          ? '; Secure'
          : ''
      const token = signSession(
        { id: staff.id, role: staff.role, version: staff.session_version ?? 0 },
        process.env.SESSION_SECRET ?? ''
      )
      await getDb().query(
        'UPDATE staff_users SET last_login_at=now() WHERE id=$1',
        [staff.id]
      )
      return json(
        {
          staff: {
            id: staff.id,
            full_name: staff.full_name,
            email: staff.email,
            role: staff.role,
            must_change_password: staff.must_change_password ?? false,
          },
        },
        200,
        {
          'set-cookie': `${cookieName}=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=28800`,
        }
      )
    }
    if (method === 'POST' && path === '/api/v1/logout') {
      const secure =
        url.protocol === 'https:' || process.env.NODE_ENV === 'production'
          ? '; Secure'
          : ''
      return json({ ok: true }, 200, {
        'set-cookie': `${cookieName}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`,
      })
    }
    const staff = await currentStaff(request)
    if (!staff) return json({ error: 'Authentication required' }, 401)
    if (method === 'GET' && path === '/api/v1/session')
      return json({
        staff: {
          id: staff.id,
          full_name: staff.full_name,
          email: staff.email,
          role: staff.role,
          must_change_password: staff.must_change_password ?? false,
        },
      })
    if (method === 'POST' && path === '/api/v1/change-password') {
      const input = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(200) }).strict().parse(await request.json())
      const version = await changeOwnPassword(getDb(), staff.id, input.currentPassword, input.newPassword)
      const secure = url.protocol === 'https:' || process.env.NODE_ENV === 'production' ? '; Secure' : ''
      const token = signSession({ id: staff.id, role: staff.role, version }, process.env.SESSION_SECRET ?? '')
      return json({ ok: true }, 200, { 'set-cookie': `${cookieName}=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=28800` })
    }
    if (staff.must_change_password) return json({ error: 'Change your temporary password to continue', code: 'PASSWORD_CHANGE_REQUIRED' }, 403)
    if (path === '/api/v1/staff' && (method === 'GET' || method === 'POST')) {
      if (!allow(staff.role, 'staff')) return json({ error: 'Action not permitted' }, 403)
      if (method === 'GET') return json({ staff: await listStaff(getDb()) })
      return json(await createStaff(getDb(), await request.json(), staff.id), 201)
    }
    const staffMatch = path.match(/^\/api\/v1\/staff\/([0-9a-f-]{36})(?:\/(reset-password))?$/i)
    if (staffMatch && (method === 'PATCH' || method === 'POST')) {
      if (!allow(staff.role, 'staff')) return json({ error: 'Action not permitted' }, 403)
      const staffId = z.uuid().parse(staffMatch[1])
      if (method === 'PATCH' && !staffMatch[2]) return json({ staff: await updateStaff(getDb(), staffId, await request.json(), staff.id) })
      if (method === 'POST' && staffMatch[2]) return json(await resetStaffPassword(getDb(), staffId, staff.id))
      return json({ error: 'Not found' }, 404)
    }
    if (method === 'GET' && path === '/api/v1/cards') {
      if (!allow(staff.role, 'cards'))
        return json({ error: 'Action not permitted' }, 403)
      return json({
        cards: await listActiveCards(getDb(), url.searchParams.get('q') ?? ''),
      })
    }
    if (path === '/api/v1/dashboard' && method === 'GET') {
      if (!allow(staff.role, 'dashboard'))
        return json({ error: 'Action not permitted' }, 403)
      const id = z.uuid().parse(url.searchParams.get('serviceId'))
      const summary = await dashboardSummary(getDb(), id)
      return summary
        ? json({ summary })
        : json({ error: 'Service not found' }, 404)
    }
    if (path.startsWith('/api/v1/reports/') && method === 'GET') {
      if (!allow(staff.role, 'export'))
        return json({ error: 'Action not permitted' }, 403)
      if (
        path === '/api/v1/reports/absentees' ||
        path === '/api/v1/reports/absentees.csv'
      ) {
        const rawCount = url.searchParams.get('count')
        const count = rawCount
          ? z.coerce.number().int().min(1).max(12).parse(rawCount)
          : 3
        const people = await absenteeList(getDb(), count)
        await auditExport(getDb(), staff.id, 'ABSENTEE_EXPORT')
        if (path.endsWith('.csv'))
          return new Response(
            csvRows(people, [
              'member_code',
              'first_name',
              'last_name',
              'phone_e164',
              'last_attended_at',
            ]),
            {
              headers: {
                'content-type': 'text/csv; charset=utf-8',
                'content-disposition': 'attachment; filename="absentees.csv"',
                'cache-control': 'no-store',
              },
            }
          )
        return json({ people })
      }
      if (path === '/api/v1/reports/attendance.csv') {
        const id = z.uuid().parse(url.searchParams.get('serviceId'))
        const rows = await attendanceList(getDb(), id)
        await auditExport(getDb(), staff.id, 'ATTENDANCE_EXPORT', id)
        return new Response(
          csvRows(rows, [
            'member_code',
            'first_name',
            'last_name',
            'checked_in_at',
            'checkin_method',
            'snapshot_stage',
          ]),
          {
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': 'attachment; filename="attendance.csv"',
              'cache-control': 'no-store',
            },
          }
        )
      }
    }
    if (path === '/api/v1/services' && method === 'GET')
      return json({ services: await listServices(getDb()) })
    if (path === '/api/v1/services' && method === 'POST') {
      if (!allow(staff.role, 'services'))
        return json({ error: 'Action not permitted' }, 403)
      return json(
        { service: await createService(getDb(), await request.json(), staff.id) },
        201
      )
    }
    const checkinMatch = path.match(
      /^\/api\/v1\/services\/([0-9a-f-]{36})\/(check-ins|manual-check-ins)$/i
    )
    if (checkinMatch && method === 'POST') {
      const manual = checkinMatch[2] === 'manual-check-ins'
      if (!allow(staff.role, manual ? 'manual' : 'checkin'))
        return json({ error: 'Action not permitted' }, 403)
      const serviceId = z.uuid().parse(checkinMatch[1])
      if (manual) {
        const body = z
          .object({
            personId: z.uuid(),
            eventId: z.uuid(),
            reason: z.string(),
          })
          .parse(await request.json())
        return json(
          await manualCheckin(
            getDb(),
            serviceId,
            body.personId,
            body.eventId,
            body.reason,
            staff.id
          )
        )
      }
      const body = z
        .object({
          credential: z.string().min(6).max(200),
          eventId: z.uuid(),
        })
        .parse(await request.json())
      return json(
        await scanCard(
          getDb(),
          serviceId,
          body.credential,
          body.eventId,
          staff.id
        )
      )
    }
    const transition = path.match(
      /^\/api\/v1\/services\/([0-9a-f-]{36})\/(open|close)$/i
    )
    if (transition && method === 'POST') {
      if (!allow(staff.role, 'services'))
        return json({ error: 'Action not permitted' }, 403)
      try {
        return json({
          service: await changeServiceStatus(
            getDb(),
            z.uuid().parse(transition[1]),
            transition[2] as 'open' | 'close'
          ),
        })
      } catch (error) {
        if (error instanceof ServiceTransitionError)
          return json({ error: error.message, code: error.code }, 409)
        throw error
      }
    }

    const issueMatch = path.match(/^\/api\/v1\/people\/([0-9a-f-]{36})\/cards$/i)
    if (issueMatch && method === 'POST') {
      if (!allow(staff.role, 'cards') && staff.role !== 'REGISTRATION_DESK')
        return json({ error: 'Action not permitted' }, 403)
      return json(
        {
          card: await issueCard(
            getDb(),
            z.uuid().parse(issueMatch[1]),
            staff.id,
            staff.role !== 'REGISTRATION_DESK'
          ),
        },
        201
      )
    }
    const attendanceMatch = path.match(
      /^\/api\/v1\/people\/([0-9a-f-]{36})\/attendance$/i
    )
    if (attendanceMatch && method === 'GET') {
      if (!allow(staff.role, 'directory'))
        return json({ error: 'Action not permitted' }, 403)
      const details = await getPersonAttendanceHistory(
        getDb(),
        staff.role,
        z.uuid().parse(attendanceMatch[1])
      )
      return details
        ? json(details)
        : json({ error: 'Person not found' }, 404)
    }
    const revokeMatch = path.match(
      /^\/api\/v1\/cards\/([0-9a-f-]{36})\/revoke$/i
    )
    if (revokeMatch && method === 'POST') {
      if (!allow(staff.role, 'cards'))
        return json({ error: 'Action not permitted' }, 403)
      await revokeCard(getDb(), z.uuid().parse(revokeMatch[1]), staff.id)
      return json({ ok: true })
    }

    if (path === '/api/v1/catalogs' && method === 'GET') {
      if (!allow(staff.role, 'register') && !allow(staff.role, 'directory'))
        return json({ error: 'Action not permitted' }, 403)
      return json(await listActiveCatalogs(getDb()))
    }
    const catalogRoute = path.match(/^\/api\/v1\/catalogs\/(compounds|departments)(?:\/([0-9a-f-]{36}))?$/i)
    if (catalogRoute) {
      if (staff.role !== 'ADMIN') return json({ error: 'Action not permitted' }, 403)
      const [, kind, id] = catalogRoute
      if (!id && method === 'POST')
        return json({ entry: await createCatalogEntry(getDb(), kind as 'compounds' | 'departments', (await request.json()).name) }, 201)
      if (id && method === 'PATCH') {
        const entry = await renameCatalogEntry(getDb(), kind as 'compounds' | 'departments', id, (await request.json()).name)
        return entry ? json({ entry }) : json({ error: 'Catalog entry not found' }, 404)
      }
      if (id && method === 'DELETE') {
        const entry = await deactivateCatalogEntry(getDb(), kind as 'compounds' | 'departments', id)
        return entry ? json({ entry }) : json({ error: 'Catalog entry not found' }, 404)
      }
      return json({ error: 'Method not allowed' }, 405)
    }
    const actions: [RegExp, Capability][] = [
      [/^\/api\/v1\/people(?:\/|$)/, method === 'GET' ? 'directory' : 'register'],
      [
        /^\/api\/v1\/services(?:\/|$)/,
        method === 'GET' ? 'checkin' : 'services',
      ],
      [/^\/api\/v1\/dashboard(?:\/|$)/, 'dashboard'],
      [/^\/api\/v1\/reports(?:\/|$)/, 'export'],
      [/^\/api\/v1\/cards(?:\/|$)/, 'cards'],
    ]
    const capability = actions.find(([pattern]) => pattern.test(path))?.[1]
    if (!capability) return json({ error: 'Not found' }, 404)
    if (!allow(staff.role, capability))
      return json({ error: 'Action not permitted' }, 403)
    if (path === '/api/v1/people' && method === 'GET') {
      const pageParam = url.searchParams.get('page')
      const pageSizeParam = url.searchParams.get('pageSize')
      const page = pageParam
        ? z.coerce.number().int().min(1).max(1000).parse(pageParam)
        : 1
      const pageSize = pageSizeParam
        ? z.coerce.number().int().min(1).max(100).parse(pageSizeParam)
        : 20
      const stage = url.searchParams.get('stage') ?? ''
      return json(
        await listPeoplePaginated(
          getDb(),
          staff.role,
          url.searchParams.get('q') ?? '',
          { stage, page, pageSize }
        )
      )
    }
    if (path === '/api/v1/people/duplicates' && method === 'POST') {
      const input = z
        .object({
          fullName: z.string().trim().min(2).max(200),
          phone: z.string().nullable().optional(),
          email: z.email().nullable().optional(),
        })
        .parse(await request.json())
      return json({
        matches: await findDuplicates(getDb(), input.fullName, input.phone ?? null, input.email ?? null),
      })
    }
    if (path === '/api/v1/people' && method === 'POST')
      return json(
        { person: await registerPerson(getDb(), await request.json(), staff.id) },
        201
      )
    return json({ error: 'Endpoint not implemented' }, 501)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
      return json({ error: 'An entry with that name already exists' }, 409)
    if (error instanceof InvalidCatalogSelection) return json({ error: error.message }, 400)
    if (error instanceof StaffError) return json({ error: error.message }, error.status)
    if (error instanceof DuplicatePersonError)
      return json({ error: error.message, matches: error.matches }, 409)
    if (error instanceof IdempotencyConflict)
      return json({ error: error.message }, 409)
    if (
      error instanceof Error &&
      error.message.startsWith('Supervisor approval required')
    )
      return json({ error: error.message }, 409)
    if (error instanceof Error && error.message === 'Invalid card format')
      return json({ error: error.message }, 400)
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: 'Invalid request' }, 400)
    process.stderr.write(
      `API operation failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    )
    return json({ error: 'Service temporarily unavailable' }, 503)
  }
}
