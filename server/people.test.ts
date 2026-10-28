import { expect, it } from 'vitest'
import { reversedName, validateRegistration, registerPerson, listPeoplePaginated, getPersonAttendanceHistory } from './people.js'

it('checks swapped first and last names when looking for duplicates', () => {
  expect(reversedName('Chinedu Okafor')).toBe('Okafor Chinedu')
})

it('requires informed consent before a person can be registered', () => {
  const details = { firstName: 'Ada', lastName: 'Okafor', email: 'ada@example.org', compoundId: '11111111-1111-4111-8111-111111111111', birthMonth: 2, birthDay: 29 }
  expect(() => validateRegistration({ ...details, consent: false })).toThrow()
  expect(validateRegistration({ ...details, consent: true }).phone).toBeNull()
})

it('requires an email, compound and birth month/day, while birth year is optional', () => {
  const details = { firstName: 'Ada', lastName: 'Okafor', email: ' Ada@Example.org ', compoundId: '11111111-1111-4111-8111-111111111111', birthMonth: 2, birthDay: 29, consent: true }
  expect(validateRegistration(details)).toMatchObject({ email: 'ada@example.org', birthMonth: 2, birthDay: 29 })
  for (const key of ['email', 'compoundId', 'birthMonth', 'birthDay'] as const) {
    const missing = { ...details }
    delete (missing as Record<string, unknown>)[key]
    expect(() => validateRegistration(missing)).toThrow()
  }
  expect(() => validateRegistration({ ...details, birthYear: 2025 })).toThrow()
  expect(validateRegistration({ ...details, birthYear: 2024 }).birthYear).toBe(2024)
  expect(() => validateRegistration({ ...details, birthMonth: 4, birthDay: 31 })).toThrow()
  expect(() => validateRegistration({ ...details, birthYear: 2100 })).toThrow()
})

it('stops a likely duplicate unless the operator confirms distinct identity', async () => {
  const details = { firstName: 'Ada', lastName: 'Okafor', email: 'ada@example.org', compoundId: '11111111-1111-4111-8111-111111111111', birthMonth: 2, birthDay: 29, consent: true }
  const sql: string[] = []
  const db = { query: async (text: string) => {
    sql.push(text)
    return { rows: [{ id: 'existing', member_code: 'CM-1001', first_name: 'Ada', last_name: 'Okafor', score: 0.9 }] }
  } }
  await expect(registerPerson(db as never, details, 'staff')).rejects.toThrow('Possible duplicate')
  expect(sql.every((statement) => !statement.includes('INSERT'))).toBe(true)
})

it('rolls back a registration when writing stage history fails', async () => {
  const details = { firstName: 'Ada', lastName: 'Okafor', email: 'ada@example.org', compoundId: '11111111-1111-4111-8111-111111111111', birthMonth: 2, birthDay: 29, consent: true }
  const statements: string[] = []
  const client = { query: async (text: string) => {
    statements.push(text)
    if (text.includes('person_stage_history')) throw new Error('history write failed')
    return { rows: [{ id: 'new-person' }] }
  }, release: () => {} }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await expect(registerPerson(db as never, details, 'staff')).rejects.toThrow('history write failed')
  expect(statements).toContain('ROLLBACK')
})

it('masks ordinary directory phones even for administrators and pastors', async () => {
  const db = { query: async () => ({ rows: [{ id: 'person', phone_e164: '+2348031234592', total_count: 1 }] }) }
  for (const role of ['ADMIN', 'PASTOR_VIEWER', 'REGISTRATION_DESK'] as const) {
    const result = await listPeoplePaginated(db as never, role, '')
    expect(result.people[0].phone).toBe('+234803*****92')
    expect(result.people[0]).not.toHaveProperty('phone_e164')
  }
})

it('returns the real total when requesting an empty page past the end', async () => {
  const db = { query: async (sql: string) => ({ rows: sql.includes('count(*)') && !sql.includes('OVER()') ? [{ total_count: '31' }] : [] }) }
  const result = await listPeoplePaginated(db as never, 'ADMIN', 'Ada', { page: 4, pageSize: 15 })
  expect(result).toMatchObject({ people: [], total: 31, page: 4, totalPages: 3 })
})

it('returns an accurate attendance total and masks phone in history details', async () => {
  const db = { query: async (sql: string) => ({ rows: sql.includes('JOIN services s') ? [{ id: 'recent' }] : [{ id: 'person', phone_e164: '+2348031234592', attendance_count: 124 }] }) }
  const result = await getPersonAttendanceHistory(db as never, 'PASTOR_VIEWER', 'person')
  expect(result?.person).toMatchObject({ phone: '+234803*****92', attendance_count: 124 })
  expect(result?.person).not.toHaveProperty('phone_e164')
  expect(result?.history).toHaveLength(1)
})
