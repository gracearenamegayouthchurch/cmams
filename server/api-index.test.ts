import { expect, it } from 'vitest'
import { jsonBody } from '../api/index.js'

it('does not double-encode a JSON body pre-parsed by Vercel as a string', () => {
  expect(jsonBody('{"consent":true}')).toBe('{"consent":true}')
  expect(jsonBody({ consent: true })).toBe('{"consent":true}')
})

it('rejects large request bodies even when Vercel has already parsed them', () => {
  expect(() => jsonBody({ name: 'a'.repeat(70_000) })).toThrow('Request is too large')
})
