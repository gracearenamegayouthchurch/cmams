import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { generateCredential, renderCard, issueCard, revokeCard, listActiveCards } from './cards'

it('creates an opaque, digest-only card record', () => {
  const credential = generateCredential()
  expect(credential.uri).toMatch(/^cma:\/\/v1\/[a-zA-Z0-9_-]{22}$/)
  expect(credential.shortCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{3}$/)
  expect(credential.tokenHash).toBe(createHash('sha256').update(credential.uri.slice(9)).digest('hex'))
  expect(credential.tokenHash).not.toContain(credential.uri)
})

it('does not report success for a card that was already revoked', async () => {
  const db = { query: async () => ({ rows: [] }) }
  await expect(revokeCard(db as never, 'card', 'staff')).rejects.toThrow('Active card not found')
})

it('never selects a token digest in staff card listings', async () => {
  let statement = ''
  await listActiveCards({ query: async (sql: string) => { statement = sql; return { rows: [] } } } as never, 'Ada')
  expect(statement).not.toContain('token_hash')
})

it('revokes the previous card before activating a replacement', async () => {
  const sql: string[] = []
  const client = { query: async (statement: string) => {
    sql.push(statement)
    if (statement.includes('FROM people')) return { rows: [{ id: 'person', member_code: 'CM-1001' }] }
    return { rows: [] }
  }, release: () => {} }
  await issueCard({ connect: async () => client } as never, 'person', 'staff')
  expect(sql.findIndex((s) => s.includes('UPDATE qr_cards'))).toBeLessThan(sql.findIndex((s) => s.includes('INSERT INTO qr_cards')))
})

it('prevents desk staff from silently replacing an existing credential', async () => {
  const client = { query: async (sql: string) => ({ rows: sql.includes('FROM people')
    ? [{ id: 'person', member_code: 'CM-1001' }] : sql.includes('FROM qr_cards') ? [{ id: 'old-card' }] : [] }), release: () => {} }
  await expect(issueCard({ connect: async () => client } as never, 'person', 'desk', false)).rejects.toThrow('Supervisor approval required')
})

it('renders a private, downloadable PNG and PDF without personal contact details', async () => {
  const credential = generateCredential()
  const result = await renderCard(credential, 'CM-1001')
  expect(result.png.subarray(1, 4).toString()).toBe('PNG')
  expect(result.pdf.subarray(0, 4).toString()).toBe('%PDF')
})
