import { afterEach, expect, it } from 'vitest'
import { getDb } from './db'

const previous = process.env.DATABASE_URL
afterEach(() => { process.env.DATABASE_URL = previous })

it('does not permit running without a server-side database connection', () => {
  delete process.env.DATABASE_URL
  expect(() => getDb()).toThrow('DATABASE_URL is not configured')
})
