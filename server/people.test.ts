import { expect, it } from 'vitest'
import { reversedName, validateRegistration, registerPerson } from './people.js'

it('checks swapped first and last names when looking for duplicates', () => {
  expect(reversedName('Chinedu Okafor')).toBe('Okafor Chinedu')
})

it('requires informed consent before a person can be registered', () => {
  expect(() => validateRegistration({ firstName: 'Ada', lastName: 'Okafor', consent: false })).toThrow()
  expect(validateRegistration({ firstName: 'Ada', lastName: 'Okafor', consent: true }).phone).toBeNull()
})

it('stops a likely duplicate unless the operator confirms distinct identity', async () => {
  const sql: string[] = []
  const db = { query: async (text: string) => {
    sql.push(text)
    return { rows: [{ id: 'existing', member_code: 'CM-1001', first_name: 'Ada', last_name: 'Okafor', score: 0.9 }] }
  } }
  await expect(registerPerson(db as never, { firstName: 'Ada', lastName: 'Okafor', consent: true }, 'staff')).rejects.toThrow('Possible duplicate')
  expect(sql.every((statement) => !statement.includes('INSERT'))).toBe(true)
})

it('rolls back a registration when writing stage history fails', async () => {
  const statements: string[] = []
  const client = { query: async (text: string) => {
    statements.push(text)
    if (text.includes('person_stage_history')) throw new Error('history write failed')
    return { rows: [{ id: 'new-person' }] }
  }, release: () => {} }
  const db = { query: async () => ({ rows: [] }), connect: async () => client }
  await expect(registerPerson(db as never, { firstName: 'Ada', lastName: 'Okafor', consent: true }, 'staff')).rejects.toThrow('history write failed')
  expect(statements).toContain('ROLLBACK')
})
