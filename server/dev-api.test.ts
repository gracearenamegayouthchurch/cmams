import { expect, it } from 'vitest'
import { rewriteDevApi } from './dev-api'
import { resolveApiPath } from './adapter'

it('forwards local API paths and query parameters to the Vercel adapter', () => {
  expect(rewriteDevApi('/api/v1/dashboard?serviceId=abc')).toBe('/api/index?path=dashboard&serviceId=abc')
  expect(resolveApiPath(rewriteDevApi('/api/v1/reports/absentees.csv?count=3') ?? '')).toBe('/api/v1/reports/absentees.csv?count=3')
  expect(rewriteDevApi('/cards')).toBeNull()
  expect(rewriteDevApi('/api/v1/')).toBeNull()
})
