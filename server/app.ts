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
  CompoundRegionConflict,
  DuplicatePersonError,
  InvalidCatalogSelection,
  findDuplicates,
  getPersonAttendanceHistory,
  listFirstTimers,
  listPeoplePaginated,
  registerPerson,
  resolveCompound,
} from './people.js'
import { compoundRegion } from './compound-regions.js'
import { issueCard, revokeCard, listActiveCards, listUnissuedPeople } from './cards.js'
import {
  changeServiceStatus,
  createService,
  listServices,
  ServiceTransitionError,
} from './services.js'
import { IdempotencyConflict, manualCheckin, scanCard } from './checkins.js'
import {
  CatalogError,
  createCatalogEntry,
  deactivateCatalogEntry,
  listActiveCatalogs,
  mergeCompounds,
  renameCatalogEntry,
  updateCompound,
} from './catalogs.js'
import { archiveCell, assignLeader, assignMember, CellAccessError, createCell, listCellLeaders, listCellMembers, listCells, updateCell, updateCellLocation } from './cells.js'
import { CellMeetingError, createCellMeeting, listCellMeetingAttendance, listCellMeetings, scanCellCard, transitionCellMeeting } from './cell-meetings.js'
import { StaffError, changeOwnPassword, createStaff, listStaff, resetStaffPassword, updateStaff } from './staff.js'
import {
  absenteeList,
  attendanceList,
  auditExport,
  csvRows,
  dashboardSummary,
  dashboardTrend,
} from './reports.js'
import { analyticsReport } from './analytics.js'

const loginFields = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
})
const cookieName = 'cmams_session'
const registrationFieldMessages: Record<string, string> = {
  firstName: 'Check the first name and try again.',
  lastName: 'Check the last name and try again.',
  middleName: 'Check the middle name and try again.',
  email: 'Check the email address and try again.',
  region: 'Choose a valid region and try again.',
  compoundName: 'Enter a valid compound name and try again.',
  room: 'Check the room and try again.',
  departmentId: 'Choose a valid department and try again.',
  cellId: 'Choose a valid cell group and try again.',
  birthMonth: 'Choose a valid birth month and try again.',
  birthDay: 'Choose a valid birth day and try again.',
  birthYear: 'Check the birth year and try again.',
  phone: 'Enter a phone number with country code and no spaces (e.g. +2348031234567), or leave it blank.',
  householdId: 'Choose a valid household and try again.',
  consent: 'Confirm privacy consent before registering.',
}

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
    'SELECT id, full_name, email, role, session_version, must_change_password, must_complete_profile, person_id FROM staff_users WHERE id=$1 AND is_active',
    [session.id]
  )
  const staff = result.rows[0] as
    | { id: string; full_name: string; email: string; role: Session['role']; session_version?: number; must_change_password?: boolean; must_complete_profile?: boolean; person_id?: string | null }
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
          must_complete_profile: staff.must_complete_profile ?? false,
          person_id: staff.person_id ?? null,
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
    if (path === '/api/v1/profile' && method === 'GET') {
      const catalogs = await listActiveCatalogs(getDb())
      let person: Record<string, unknown> | null = null
      if (staff.person_id) {
        const pResult = await getDb().query(
          `SELECT p.id, p.member_code, p.first_name, p.last_name, p.middle_name, p.phone_e164, p.email,
                  p.room, p.birth_month, p.birth_day, p.birth_year, p.academic_level,
                  p.compound_id, c.name AS compound_name, c.region,
                  pd.department_id, d.name AS department_name,
                  q.short_code AS card_short_code
           FROM people p
           LEFT JOIN compounds c ON c.id = p.compound_id
           LEFT JOIN person_departments pd ON pd.person_id = p.id AND pd.valid_to IS NULL
           LEFT JOIN departments d ON d.id = pd.department_id
           LEFT JOIN qr_cards q ON q.person_id = p.id AND q.status = 'ACTIVE'
           WHERE p.id = $1 AND p.deleted_at IS NULL`,
          [staff.person_id]
        )
        person = pResult.rows[0] ? (pResult.rows[0] as Record<string, unknown>) : null
      }
      return json({
        staff: {
          id: staff.id,
          full_name: staff.full_name,
          email: staff.email,
          role: staff.role,
          must_complete_profile: staff.must_complete_profile ?? false,
          person_id: staff.person_id ?? null,
        },
        person,
        catalogs,
      })
    }
    if (path === '/api/v1/profile/skip' && method === 'POST') {
      await getDb().query('UPDATE staff_users SET must_complete_profile = false WHERE id = $1', [staff.id])
      return json({ ok: true })
    }
    if (path === '/api/v1/profile' && method === 'POST') {
      const profileBody = z.object({
        phone: z.string().trim().nullable().optional(),
        departmentId: z.uuid().nullable().optional(),
        region: compoundRegion,
        compoundName: z.string().trim().min(1).max(100),
        room: z.string().trim().max(100).nullable().optional(),
        academicLevel: z.string().trim().max(50).nullable().optional(),
        birthMonth: z.number().int().min(1).max(12),
        birthDay: z.number().int().min(1).max(31),
        birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
      }).parse(await request.json())

      let formattedPhone: string | null = null
      if (profileBody.phone) {
        const cleaned = profileBody.phone.replace(/[\s\-()]/g, '')
        if (cleaned.startsWith('+')) formattedPhone = cleaned
        else if (cleaned.startsWith('0') && cleaned.length === 11) formattedPhone = `+234${cleaned.slice(1)}`
        else if (cleaned.startsWith('234')) formattedPhone = `+${cleaned}`
        else formattedPhone = cleaned ? `+${cleaned}` : null
      }

      const client = await getDb().connect()
      try {
        await client.query('BEGIN')
        const compoundId = await resolveCompound(
          client,
          { name: profileBody.compoundName, region: profileBody.region },
          staff.id
        )

        let personId = staff.person_id
        if (!personId) {
          const found = (await client.query('SELECT id FROM people WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1', [staff.email])).rows[0] as { id: string } | undefined
          if (found) personId = found.id
        }

        if (personId) {
          await client.query(
            `UPDATE people
             SET phone_e164 = coalesce($1, phone_e164),
                 compound_id = $2,
                 room = $3,
                 birth_month = $4,
                 birth_day = $5,
                 birth_year = coalesce($6, birth_year),
                 academic_level = coalesce($7, academic_level),
                 updated_at = now()
             WHERE id = $8`,
            [
              formattedPhone,
              compoundId,
              profileBody.room || null,
              profileBody.birthMonth,
              profileBody.birthDay,
              profileBody.birthYear || null,
              profileBody.academicLevel || null,
              personId,
            ]
          )
        } else {
          const nameParts = staff.full_name.trim().split(/\s+/)
          const firstName = nameParts[0] || 'Staff'
          const lastName = nameParts.slice(1).join(' ') || 'Member'
          const created = await client.query(
            `INSERT INTO people(
               first_name, last_name, email, phone_e164,
               compound_id, room, birth_month, birth_day, birth_year,
               academic_level, lifecycle_stage, privacy_consent_at, registered_by_staff_id
             ) VALUES (
               $1, $2, lower($3), $4,
               $5, $6, $7, $8, $9,
               $10, 'MEMBER', now(), $11
             ) RETURNING id, member_code`,
            [
              firstName,
              lastName,
              staff.email,
              formattedPhone,
              compoundId,
              profileBody.room || null,
              profileBody.birthMonth,
              profileBody.birthDay,
              profileBody.birthYear || null,
              profileBody.academicLevel || null,
              staff.id,
            ]
          )
          personId = created.rows[0].id
        }

        if (profileBody.departmentId) {
          await client.query(
            'UPDATE person_departments SET valid_to = now() WHERE person_id = $1 AND valid_to IS NULL',
            [personId]
          )
          await client.query(
            'INSERT INTO person_departments(person_id, department_id, assigned_by_staff_id) VALUES ($1, $2, $3)',
            [personId, profileBody.departmentId, staff.id]
          )
        }

        await client.query(
          'UPDATE staff_users SET person_id = $1, must_complete_profile = false WHERE id = $2',
          [personId, staff.id]
        )

        const activeCard = (await client.query(
          "SELECT id, short_code FROM qr_cards WHERE person_id = $1 AND status = 'ACTIVE' LIMIT 1",
          [personId]
        )).rows[0] as { id: string; short_code: string } | undefined

        let cardShortCode = activeCard?.short_code
        if (!activeCard) {
          try {
            const issued = await issueCard(getDb(), personId as string, staff.id, true)
            cardShortCode = issued.shortCode
          } catch {
            // Card issuance non-fatal if card already exists
          }
        }

        await client.query(
          `INSERT INTO audit_logs(actor_staff_id, action_type, target_entity, target_id, new_state)
           VALUES ($1, 'STAFF_PROFILE_COMPLETED', 'staff', $2, jsonb_build_object('person_id', $3::text))`,
          [staff.id, staff.id, personId]
        )

        await client.query('COMMIT')
        return json({ ok: true, personId, cardShortCode })
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    }

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
        unissued: await listUnissuedPeople(getDb(), url.searchParams.get('q') ?? ''),
      })
    }
    if (path === '/api/v1/dashboard' && method === 'GET') {
      if (!allow(staff.role, 'dashboard'))
        return json({ error: 'Action not permitted' }, 403)
      const id = z.uuid().parse(url.searchParams.get('serviceId'))
      const summary = await dashboardSummary(getDb(), id)
      return summary
        ? json({ summary, trend: await dashboardTrend(getDb(), id) })
        : json({ error: 'Service not found' }, 404)
    }
    if (path === '/api/v1/analytics' && method === 'GET') {
      if (!allow(staff.role, 'dashboard'))
        return json({ error: 'Action not permitted' }, 403)
      const id = z.uuid().parse(url.searchParams.get('serviceId'))
      const report = await analyticsReport(getDb(), id)
      return report ? json(report) : json({ error: 'Service not found' }, 404)
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
          : undefined
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
    if (path === '/api/v1/services' && method === 'GET') {
      if (staff.role === 'CELL_LEADER') return json({ error: 'Action not permitted' }, 403)
      return json({ services: await listServices(getDb()) })
    }
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

    if (path === '/api/v1/first-timers' && method === 'GET') {
      if (!allow(staff.role, 'directory'))
        return json({ error: 'Action not permitted' }, 403)
      const rawPage = Number(url.searchParams.get('page'))
      const rawPageSize = Number(url.searchParams.get('pageSize'))
      return json(
        await listFirstTimers(
          getDb(),
          staff.role,
          url.searchParams.get('q') ?? '',
          {
            filter: url.searchParams.get('filter') ?? 'all',
            serviceId: url.searchParams.get('serviceId') ?? '',
            page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
            pageSize:
              Number.isFinite(rawPageSize) && rawPageSize > 0
                ? rawPageSize
                : 15,
          }
        )
      )
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

    if (path === '/api/v1/cells' && method === 'GET')
      return json({ cells: await listCells(getDb(), staff) })
    if (path === '/api/v1/cell-leaders' && method === 'GET')
      return json({ leaders: await listCellLeaders(getDb(), staff) })
    if (path === '/api/v1/cells' && method === 'POST')
      return json({ cell: await createCell(getDb(), await request.json(), staff) }, 201)
    const cellEdit = path.match(/^\/api\/v1\/cells\/([0-9a-f-]{36})$/i)
    if (cellEdit && method === 'PATCH')
      return json({ cell: await updateCell(getDb(), cellEdit[1], await request.json(), staff) })
    const cellLocation = path.match(/^\/api\/v1\/cells\/([0-9a-f-]{36})\/location$/i)
    if (cellLocation && method === 'PATCH')
      return json({ cell: await updateCellLocation(getDb(), cellLocation[1], await request.json(), staff) })
    const cellMembers = path.match(/^\/api\/v1\/cells\/([0-9a-f-]{36})\/members$/i)
    if (cellMembers && method === 'GET')
      return json({ members: await listCellMembers(getDb(), staff, cellMembers[1]) })
    if (cellMembers && method === 'POST') {
      const body = z.object({ personId: z.uuid() }).parse(await request.json())
      await assignMember(getDb(), cellMembers[1], body.personId, staff)
      return json({ ok: true })
    }
    const cellLeader = path.match(/^\/api\/v1\/cells\/([0-9a-f-]{36})\/leader$/i)
    if (cellLeader && method === 'POST') {
      const body = z.object({ staffId: z.uuid() }).parse(await request.json())
      await assignLeader(getDb(), cellLeader[1], body.staffId, staff)
      return json({ ok: true })
    }
    const cellArchive = path.match(/^\/api\/v1\/cells\/([0-9a-f-]{36})\/archive$/i)
    if (cellArchive && method === 'POST') {
      await archiveCell(getDb(), cellArchive[1], staff)
      return json({ ok: true })
    }
    const cellMeetings = path.match(/^\/api\/v1\/cells\/([0-9a-f-]{36})\/meetings$/i)
    if (cellMeetings && method === 'GET')
      return json({ meetings: await listCellMeetings(getDb(), cellMeetings[1], staff) })
    if (cellMeetings && method === 'POST')
      return json({ meeting: await createCellMeeting(getDb(), cellMeetings[1], await request.json(), staff) }, 201)
    const cellAction = path.match(/^\/api\/v1\/cell-meetings\/([0-9a-f-]{36})\/(open|close|check-ins)$/i)
    const cellAttendance = path.match(/^\/api\/v1\/cell-meetings\/([0-9a-f-]{36})\/attendance$/i)
    if (cellAttendance && method === 'GET')
      return json({ attendance: await listCellMeetingAttendance(getDb(), cellAttendance[1], staff) })
    if (cellAction && method === 'POST') {
      if (cellAction[2] !== 'check-ins')
        return json({ meeting: await transitionCellMeeting(getDb(), cellAction[1], cellAction[2] as 'open' | 'close', staff) })
      const body = z.object({ credential: z.string().min(6).max(200), eventId: z.uuid() }).parse(await request.json())
      return json(await scanCellCard(getDb(), cellAction[1], body.credential, body.eventId, staff))
    }
    if (path === '/api/v1/catalogs' && method === 'GET') {
      if (!allow(staff.role, 'register') && !allow(staff.role, 'directory'))
        return json({ error: 'Action not permitted' }, 403)
      return json(await listActiveCatalogs(getDb()))
    }
    const compoundMerge = path.match(
      /^\/api\/v1\/catalogs\/compounds\/([0-9a-f-]{36})\/merge$/i
    )
    if (compoundMerge && method === 'POST') {
      if (staff.role !== 'ADMIN')
        return json({ error: 'Action not permitted' }, 403)
      const body = z.object({ intoId: z.uuid() }).parse(await request.json())
      return json({
        compound: await mergeCompounds(
          getDb(),
          compoundMerge[1],
          body.intoId,
          staff.id
        ),
      })
    }
    const catalogRoute = path.match(/^\/api\/v1\/catalogs\/(compounds|departments)(?:\/([0-9a-f-]{36}))?$/i)
    if (catalogRoute) {
      if (staff.role !== 'ADMIN') return json({ error: 'Action not permitted' }, 403)
      const [, kind, id] = catalogRoute
      if (!id && method === 'POST')
        return json({ entry: await createCatalogEntry(getDb(), kind as 'compounds' | 'departments', (await request.json()).name) }, 201)
      if (id && method === 'PATCH') {
        if (kind === 'compounds')
          return json({
            compound: await updateCompound(
              getDb(),
              id,
              await request.json(),
              staff.id
            ),
          })
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
      [/^\/api\/v1\/analytics(?:\/|$)/, 'dashboard'],
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
    if (error instanceof CellAccessError) return json({ error: error.message }, 403)
    if (error instanceof CellMeetingError) return json({ error: error.message }, error.status)
    if (error instanceof CompoundRegionConflict)
      return json(
        {
          error: error.message,
          code: 'COMPOUND_REGION_CONFLICT',
          region: error.region,
        },
        409
      )
    if (error instanceof CatalogError) return json({ error: error.message }, 400)
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
      return json({ error: path.startsWith('/api/v1/catalogs/') || path === '/api/v1/cells' ? 'An entry with that name already exists' : 'Conflicting request; please retry or review existing records' }, 409)
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
    if (error instanceof z.ZodError && path === '/api/v1/people' && method === 'POST') {
      const field = String(error.issues[0]?.path[0] ?? '')
      return json({
        error: registrationFieldMessages[field] ?? 'Invalid request',
        code: 'REGISTRATION_VALIDATION_ERROR',
      }, 400)
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: 'Invalid request' }, 400)
    process.stderr.write(
      `API operation failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    )
    return json({ error: 'Service temporarily unavailable' }, 503)
  }
}
