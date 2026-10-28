import { expect, it } from 'vitest'
import { absenteeList, csvCell, turnoutPercent } from './reports.js'

it('never reports turnout above 100 percent or divides by zero', () => {
  expect(turnoutPercent(10, 0)).toBe(0)
  expect(turnoutPercent(15, 10)).toBe(100)
  expect(turnoutPercent(7, 10)).toBe(70)
})

it('follows up after two missed Sundays by default', async () => {
  const calls: { sql: string; args?: unknown[] }[] = []
  const db = {
    query: async (sql: string, args?: unknown[]) => {
      calls.push({ sql, args })
      return { rows: [] }
    },
  }
  await absenteeList(db as never)
  expect(calls[0]?.args).toEqual([2])
})

it('escapes spreadsheet formulas and commas in pastoral exports', () => {
  expect(csvCell('=HYPERLINK("https://host")')).toBe('"\'=HYPERLINK(""https://host"")"')
  expect(csvCell('Ada, Okafor')).toBe('"Ada, Okafor"')
})
