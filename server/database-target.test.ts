import { expect, it } from 'vitest'
import { assertChurchDatabase } from './database-target'

const ref = 'dyngikqhjxqprjhvrscz'

it('accepts direct and pooler connections only for the approved church project', () => {
  expect(() => assertChurchDatabase(`postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`, ref)).not.toThrow()
  expect(() => assertChurchDatabase(`postgresql://postgres.${ref}:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`, ref)).not.toThrow()
})

it('rejects other projects, unqualified pooler users, and arbitrary hosts', () => {
  expect(() => assertChurchDatabase('postgresql://postgres:secret@db.oaeulhjfpwdzkqmqxley.supabase.co/postgres', ref)).toThrow()
  expect(() => assertChurchDatabase('postgresql://postgres:secret@aws-0-eu-west-1.pooler.supabase.com/postgres', ref)).toThrow()
  expect(() => assertChurchDatabase(`postgresql://postgres.${ref}:secret@attacker.example/postgres`, ref)).toThrow()
})
