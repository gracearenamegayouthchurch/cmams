import { expect, it } from 'vitest'
import {
  CompoundRegionConflict,
  getPersonAttendanceHistory,
  listPeoplePaginated,
  registerPerson,
  reversedName,
  validateRegistration,
} from './people.js'

const baseDetails = {
  firstName: 'Ada',
  lastName: 'Okafor',
  email: 'ada@example.org',
  region: 'ACROSS' as const,
  compoundName: 'East Gate',
  birthMonth: 2,
  birthDay: 29,
  consent: true,
}

it('checks swapped first and last names when looking for duplicates', () => {
  expect(reversedName('Chinedu Okafor')).toBe('Okafor Chinedu')
})

it('requires informed consent before a person can be registered', () => {
  expect(() => validateRegistration({ ...baseDetails, consent: false })).toThrow()
  expect(validateRegistration({ ...baseDetails, consent: true }).phone).toBeNull()
})

it('requires an email, region, compound and birth month/day, while birth year is optional', () => {
  const details = { ...baseDetails, email: ' Ada@Example.org ' }
  expect(validateRegistration(details)).toMatchObject({
    email: 'ada@example.org',
    region: 'ACROSS',
    compoundName: 'East Gate',
    birthMonth: 2,
    birthDay: 29,
  })
  for (const key of [
    'email',
    'region',
    'compoundName',
    'birthMonth',
    'birthDay',
  ] as const) {
    const missing = { ...details }
    delete (missing as Record<string, unknown>)[key]
    expect(() => validateRegistration(missing)).toThrow()
  }
  expect(() => validateRegistration({ ...details, region: 'UNKNOWN' })).toThrow()
  expect(() => validateRegistration({ ...details, birthYear: 2025 })).toThrow()
  expect(validateRegistration({ ...details, birthYear: 2024 }).birthYear).toBe(
    2024
  )
  expect(() =>
    validateRegistration({ ...details, birthMonth: 4, birthDay: 31 })
  ).toThrow()
  expect(() => validateRegistration({ ...details, birthYear: 2100 })).toThrow()
})

it('stops a likely duplicate unless the operator confirms distinct identity', async () => {
  const sql: string[] = []
  const db = {
    query: async (text: string) => {
      sql.push(text)
      return {
        rows: [
          {
            id: 'existing',
            member_code: 'CM-1001',
            first_name: 'Ada',
            last_name: 'Okafor',
            score: 0.9,
          },
        ],
      }
    },
  }
  await expect(registerPerson(db as never, baseDetails, 'staff')).rejects.toThrow(
    'Possible duplicate'
  )
  expect(sql.every((statement) => !statement.includes('INSERT'))).toBe(true)
})

it('rolls back a registration when writing stage history fails', async () => {
  const statements: string[] = []
  const client = {
    query: async (text: string) => {
      statements.push(text)
      if (text.includes('FROM compounds WHERE normalized_name'))
        return { rows: [{ id: 'compound', region: 'ACROSS', is_active: true }] }
      if (text.includes('person_stage_history'))
        throw new Error('history write failed')
      if (text.includes('INSERT INTO people'))
        return { rows: [{ id: 'new-person' }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await expect(registerPerson(db as never, baseDetails, 'staff')).rejects.toThrow(
    'history write failed'
  )
  expect(statements).toContain('ROLLBACK')
})

it('stores new registration fields and one active department in the same transaction', async () => {
  const statements: { sql: string; params?: unknown[] }[] = []
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      statements.push({ sql, params })
      if (sql.includes('FROM compounds WHERE normalized_name'))
        return { rows: [{ id: 'compound', region: 'ACROSS', is_active: true }] }
      if (sql.includes('FROM departments'))
        return {
          rows: [{ id: '22222222-2222-4222-8222-222222222222' }],
        }
      if (sql.includes('INSERT INTO people'))
        return { rows: [{ id: 'person', member_code: 'CM-1002' }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  const details = {
    ...baseDetails,
    email: 'Ada@Example.org',
    departmentId: '22222222-2222-4222-8222-222222222222',
    room: 'A 12',
    birthYear: 2024,
  }
  await registerPerson(db as never, details, 'staff')
  const insert = statements.find(({ sql }) => sql.includes('INSERT INTO people'))
  expect(insert?.params).toContain('ada@example.org')
  expect(insert?.params).toContain('compound')
  expect(insert?.params).toContain('A 12')
  expect(insert?.params).toContain(2024)
  expect(
    statements.some(({ sql }) => sql.includes('INSERT INTO person_departments'))
  ).toBe(true)
  expect(statements.at(-1)?.sql).toBe('COMMIT')
})

it('checks the optional active cell and saves membership atomically with registration', async () => {
  const queries: { sql: string; params?: unknown[] }[] = []
  const cellId = '33333333-3333-4333-8333-333333333333'
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('FROM compounds WHERE normalized_name'))
        return { rows: [{ id: 'compound', region: 'ACROSS', is_active: true }] }
      if (sql.includes('FROM cells')) return { rows: [{ id: cellId }] }
      if (sql.includes('INSERT INTO people')) return { rows: [{ id: 'person' }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await registerPerson(db as never, { ...baseDetails, cellId }, 'staff')
  expect(queries.find(({ sql }) => sql.includes('FROM cells'))?.params).toEqual([
    cellId,
  ])
  expect(
    queries.find(({ sql }) => sql.includes('INSERT INTO cell_memberships'))
      ?.params
  ).toEqual([cellId, 'person', 'staff'])
  expect(queries.at(-1)?.sql).toBe('COMMIT')
})

it('creates a missing compound under the selected region in the registration transaction', async () => {
  const queries: { sql: string; params?: unknown[] }[] = []
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('FROM compounds WHERE normalized_name'))
        return { rows: [] }
      if (sql.includes('INSERT INTO compounds'))
        return { rows: [{ id: 'new-compound' }] }
      if (sql.includes('INSERT INTO people'))
        return { rows: [{ id: 'person' }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await registerPerson(
    db as never,
    { ...baseDetails, compoundName: '  Army   Barracks ' },
    'staff'
  )
  expect(
    queries.find(({ sql }) => sql.includes('INSERT INTO compounds'))?.params
  ).toEqual(['Army Barracks', 'ACROSS'])
  expect(
    queries.find(({ sql }) => sql.includes('INSERT INTO people'))?.params
  ).toContain('new-compound')
  expect(queries.at(-1)?.sql).toBe('COMMIT')
})

it('reuses an existing compound ignoring case and repeated spaces', async () => {
  const queries: { sql: string; params?: unknown[] }[] = []
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('FROM compounds WHERE normalized_name'))
        return { rows: [{ id: 'compound', region: 'ACROSS', is_active: true }] }
      if (sql.includes('INSERT INTO people'))
        return { rows: [{ id: 'person' }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await registerPerson(
    db as never,
    { ...baseDetails, compoundName: '  east   GATE ' },
    'staff'
  )
  expect(
    queries.find(({ sql }) => sql.includes('FROM compounds WHERE normalized_name'))
      ?.params
  ).toEqual(['east gate'])
  expect(queries.some(({ sql }) => sql.includes('INSERT INTO compounds'))).toBe(
    false
  )
  expect(
    queries.find(({ sql }) => sql.includes('INSERT INTO people'))?.params
  ).toContain('compound')
})

it('uses the compound another registration created first instead of inserting a duplicate', async () => {
  let compoundSelects = 0
  const queries: { sql: string; params?: unknown[] }[] = []
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('FROM compounds WHERE normalized_name')) {
        compoundSelects += 1
        return {
          rows:
            compoundSelects === 1
              ? []
              : [{ id: 'compound', region: 'ACROSS' }],
        }
      }
      if (sql.includes('INSERT INTO compounds')) return { rows: [] }
      if (sql.includes('INSERT INTO people'))
        return { rows: [{ id: 'person' }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await registerPerson(db as never, baseDetails, 'staff')
  expect(
    queries.filter(({ sql }) => sql.includes('INSERT INTO compounds'))
  ).toHaveLength(1)
  expect(
    queries.find(({ sql }) => sql.includes('INSERT INTO people'))?.params
  ).toContain('compound')
})

it('rejects a compound already saved under another region without creating a person', async () => {
  const statements: string[] = []
  const client = {
    query: async (sql: string) => {
      statements.push(sql)
      if (sql.includes('FROM compounds WHERE normalized_name'))
        return { rows: [{ id: 'compound', region: 'NDAR', is_active: true }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await expect(
    registerPerson(db as never, baseDetails, 'staff')
  ).rejects.toBeInstanceOf(CompoundRegionConflict)
  expect(statements).toContain('ROLLBACK')
  expect(statements.some((sql) => sql.includes('INSERT INTO people'))).toBe(
    false
  )
})

it('reactivates a deactivated compound when it is entered again', async () => {  const statements: { sql: string; params?: unknown[] }[] = []
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      statements.push({ sql, params })
      if (sql.includes('FROM compounds WHERE normalized_name'))
        return { rows: [{ id: 'compound', region: 'ACROSS', is_active: false }] }
      if (sql.includes('INSERT INTO people'))
        return { rows: [{ id: 'person' }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await registerPerson(db as never, baseDetails, 'staff')
  expect(
    statements.some(
      ({ sql, params }) =>
        sql.includes('UPDATE compounds SET is_active=true') &&
        params?.[0] === 'compound'
    )
  ).toBe(true)
  expect(statements.some(({ sql }) => sql.includes('COMPOUND_REACTIVATED'))).toBe(
    true
  )
})

it('masks ordinary directory phones even for administrators and pastors', async () => {
  const db = {
    query: async () => ({
      rows: [{ id: 'person', phone_e164: '+2348031234592', total_count: 1 }],
    }),
  }
  for (const role of ['ADMIN', 'PASTOR_VIEWER', 'REGISTRATION_DESK'] as const) {
    const result = await listPeoplePaginated(db as never, role, '')
    expect(result.people[0].phone).toBe('+234803*****92')
    expect(result.people[0]).not.toHaveProperty('phone_e164')
  }
})

it('searches shared phones in both paginated results and empty-page totals without exposing the number', async () => {
  const calls: { sql: string; params: unknown[] }[] = []
  const db = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params })
      return {
        rows: sql.includes('OVER()')
          ? [
              { id: 'ada', phone_e164: '+2348031234592', total_count: 2 },
              { id: 'bola', phone_e164: '+2348031234592', total_count: 2 },
            ]
          : [{ total_count: 2 }],
      }
    },
  }
  const result = await listPeoplePaginated(
    db as never,
    'REGISTRATION_DESK',
    '0803 123-4592'
  )
  expect(result.total).toBe(2)
  expect(result.people).toMatchObject([{ id: 'ada' }, { id: 'bola' }])
  expect(result.people.every((person) => person.phone === '+234803*****92')).toBe(true)
  expect(result.people[0]).not.toHaveProperty('phone_e164')
  expect(calls[0].sql).toMatch(/phone_e164.*\$5/s)
  expect(calls[0].params[4]).toBe('2348031234592')

  const empty = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params })
      return { rows: sql.includes('OVER()') ? [] : [{ total_count: 2 }] }
    },
  }
  await listPeoplePaginated(empty as never, 'ADMIN', '+2348031234592', {
    page: 99,
  })
  expect(calls.at(-1)?.sql).toMatch(/phone_e164.*\$3/s)
  expect(calls.at(-1)?.params[2]).toBe('2348031234592')
  await listPeoplePaginated(empty as never, 'ADMIN', 'Ada', { page: 99 })
  expect(calls.at(-1)?.params[2]).toBe('')
})

it('returns the real total when requesting an empty page past the end', async () => {
  const db = {
    query: async (sql: string) => ({
      rows:
        sql.includes('count(*)') && !sql.includes('OVER()')
          ? [{ total_count: '31' }]
          : [],
    }),
  }
  const result = await listPeoplePaginated(db as never, 'ADMIN', 'Ada', {
    page: 4,
    pageSize: 15,
  })
  expect(result).toMatchObject({
    people: [],
    total: 31,
    page: 4,
    totalPages: 3,
  })
})

it('returns an accurate attendance total and masks phone in history details', async () => {
  const db = {
    query: async (sql: string) => ({
      rows: sql.includes('JOIN services s')
        ? [{ id: 'recent' }]
        : [{ id: 'person', phone_e164: '+2348031234592', attendance_count: 124 }],
    }),
  }
  const result = await getPersonAttendanceHistory(
    db as never,
    'PASTOR_VIEWER',
    'person'
  )
  expect(result?.person).toMatchObject({
    phone: '+234803*****92',
    attendance_count: 124,
  })
  expect(result?.person).not.toHaveProperty('phone_e164')
  expect(result?.history).toHaveLength(1)
})
