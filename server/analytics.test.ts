import { expect, it } from 'vitest'
import { analyticsReport } from './analytics.js'

const serviceId = '11111111-1111-4111-8111-111111111111'
const sundayId = '22222222-2222-4222-8222-222222222222'
const cellId = '33333333-3333-4333-8333-333333333333'
const departmentId = '44444444-4444-4444-8444-444444444444'

it('returns null when the selected service does not exist', async () => {
  const statements: string[] = []
  const db = {
    query: async (sql: string) => {
      statements.push(sql)
      return { rows: [] }
    },
  }

  await expect(analyticsReport(db as never, serviceId)).resolves.toBeNull()
  expect(statements).toHaveLength(1)
})

it('assembles attendance, breakdowns, and the latest-Sunday absentee list', async () => {
  const statements: { sql: string; args?: unknown[] }[] = []
  const db = {
    query: async (sql: string, args?: unknown[]) => {
      statements.push({ sql, args })
      if (sql.includes('WHERE s.id=$1 GROUP BY s.id'))
        return {
          rows: [
            {
              id: serviceId,
              name: 'Sunday Celebration',
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
      if (sql.includes('LIMIT 12'))
        return {
          rows: [
            {
              id: sundayId,
              name: 'Sunday Celebration',
              scheduled_start_at: new Date('2026-10-25T08:00:00.000Z'),
              total: 10,
              members: 7,
              first_timers: 2,
              returning_visitors: 1,
            },
            {
              id: '55555555-5555-4555-8555-555555555555',
              name: 'Sunday Celebration',
              scheduled_start_at: new Date('2026-10-18T08:00:00.000Z'),
              total: 8,
              members: 6,
              first_timers: 1,
              returning_visitors: 1,
            },
          ],
        }
      if (sql.includes('FROM cells c'))
        return {
          rows: [
            {
              id: cellId,
              name: 'Ndar Region 1',
              region: 'NDAR',
              members: 4,
              attendees: 3,
            },
          ],
        }
      if (sql.includes('FROM people p') && sql.includes('NOT EXISTS'))
        return { rows: [{ members: 5, attendees: 2 }] }
      if (sql.includes('FROM departments d'))
        return {
          rows: [
            {
              id: departmentId,
              name: 'Choir',
              members: 3,
              attendees: 2,
            },
          ],
        }
      if (sql.includes('WITH latest'))
        return {
          rows: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              member_code: 'CM-1001',
              first_name: 'Ada',
              last_name: 'Okafor',
              cell_name: 'Ndar Region 1',
              last_attended_at: new Date('2026-10-11T08:30:00.000Z'),
            },
          ],
        }
      return { rows: [] }
    },
  }

  const report = await analyticsReport(db as never, serviceId)

  expect(report).toMatchObject({
    service: {
      id: serviceId,
      name: 'Sunday Celebration',
      status: 'CHECKIN_CLOSED',
      scheduled_start_at: '2026-10-25T08:00:00.000Z',
    },
    summary: {
      total: 10,
      members: 7,
      first_timers: 2,
      returning_visitors: 1,
      eligible: 14,
      turnoutPercent: 50,
    },
    unassigned: { members: 5, attendees: 2 },
    latestSunday: {
      id: sundayId,
      name: 'Sunday Celebration',
      date: '2026-10-25T08:00:00.000Z',
    },
    absentees: [
      {
        member_code: 'CM-1001',
        cell_name: 'Ndar Region 1',
        last_attended_at: '2026-10-11T08:30:00.000Z',
      },
    ],
  })
  expect(report?.trend.map((point) => point.date)).toEqual([
    '2026-10-18T08:00:00.000Z',
    '2026-10-25T08:00:00.000Z',
  ])
  expect(report?.cells[0]).toMatchObject({
    name: 'Ndar Region 1',
    region: 'NDAR',
    members: 4,
    attendees: 3,
    turnoutPercent: 75,
  })
  expect(report?.departments[0]).toMatchObject({
    name: 'Choir',
    members: 3,
    attendees: 2,
    turnoutPercent: 66.7,
  })

  const cellQuery = statements.find(({ sql }) => sql.includes('FROM cells c'))
  expect(cellQuery?.sql).toContain('m.valid_to IS NULL')
  expect(cellQuery?.sql).toContain('c.is_active')
  expect(cellQuery?.args).toEqual([serviceId])
  const absenteeQuery = statements.find(({ sql }) => sql.includes('WITH latest'))
  expect(absenteeQuery?.sql).toContain("status='CHECKIN_CLOSED'")
  expect(absenteeQuery?.sql).toContain("p.lifecycle_stage='MEMBER'")
})
