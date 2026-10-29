import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import {
  generateCredential,
  issueCard,
  revokeCard,
  listActiveCards,
  listUnissuedPeople,
} from './cards.js'

it('creates an opaque, digest-only card record', () => {
  const credential = generateCredential()
  expect(credential.uri).toMatch(/^cma:\/\/v1\/[a-zA-Z0-9_-]{22}$/)
  expect(credential.shortCode).toMatch(
    /^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{3}$/
  )
  expect(credential.tokenHash).toBe(
    createHash('sha256').update(credential.uri.slice(9)).digest('hex')
  )
  expect(credential.tokenHash).not.toContain(credential.uri)
})

it('does not report success for a card that was already revoked', async () => {
  const db = { query: async () => ({ rows: [] }) }
  await expect(revokeCard(db as never, 'card', 'staff')).rejects.toThrow(
    'Active card not found'
  )
})

it('never selects a token digest in staff card listings', async () => {
  let statement = ''
  await listActiveCards(
    {
      query: async (sql: string) => {
        statement = sql
        return { rows: [] }
      },
    } as never,
    'Ada'
  )
  expect(statement).not.toContain('token_hash')
})

it('queries people without active cards for the unissued list', async () => {
  let statement = ''
  await listUnissuedPeople(
    {
      query: async (sql: string) => {
        statement = sql
        return { rows: [] }
      },
    } as never,
    ''
  )
  expect(statement).toContain('NOT EXISTS')
  expect(statement).not.toContain('token_hash')
})

it('revokes the previous card before activating a replacement', async () => {
  const sql: string[] = []
  const client = {
    query: async (statement: string) => {
      sql.push(statement)
      if (statement.includes('FROM people'))
        return { rows: [{ id: 'person', member_code: 'CM-1001' }] }
      if (statement.includes('INSERT INTO qr_cards'))
        return { rows: [{ id: 'card' }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const result = await issueCard(
    { connect: async () => client } as never,
    'person',
    'staff'
  )
  expect(sql.findIndex((s) => s.includes('UPDATE qr_cards'))).toBeLessThan(
    sql.findIndex((s) => s.includes('INSERT INTO qr_cards'))
  )
  expect(result.credential).toMatch(/^cma:\/\/v1\/[a-zA-Z0-9_-]{22}$/)
  expect(result).not.toHaveProperty('png')
  expect(result).not.toHaveProperty('pdf')
})

it('prevents desk staff from silently replacing an existing credential', async () => {
  const client = {
    query: async (sql: string) => ({
      rows: sql.includes('FROM people')
        ? [{ id: 'person', member_code: 'CM-1001' }]
        : sql.includes('FROM qr_cards')
          ? [{ id: 'old-card' }]
          : [],
    }),
    release: () => {},
  }
  await expect(
    issueCard(
      { connect: async () => client } as never,
      'person',
      'desk',
      false
    )
  ).rejects.toThrow('Supervisor approval required')
})

it('retries with a fresh short code when a short code is already taken', async () => {
  const inserts: unknown[][] = []
  const client = {
    query: async (statement: string, values?: unknown[]) => {
      if (statement.includes('FROM people'))
        return { rows: [{ id: 'person', member_code: 'CM-1001' }] }
      if (statement.includes('INSERT INTO qr_cards')) {
        inserts.push(values ?? [])
        return { rows: inserts.length === 1 ? [] : [{ id: 'card' }] }
      }
      return { rows: [] }
    },
    release: () => {},
  }
  const result = await issueCard(
    { connect: async () => client } as never,
    'person',
    'staff'
  )
  expect(inserts).toHaveLength(2)
  expect(result.shortCode).toBe(inserts[1][2])
  expect(result.credential).toMatch(/^cma:\/\/v1\/[a-zA-Z0-9_-]{22}$/)
})
