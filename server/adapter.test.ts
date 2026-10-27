import { expect, it } from 'vitest'
import { resolveApiPath } from './adapter.js'

it('accepts only the V1 API prefix after the Vercel rewrite', () => {
  expect(resolveApiPath('/api/index?path=services/123')).toBe('/api/v1/services/123')
  expect(resolveApiPath('/api/index?path=..%2F..%2Fadmin')).toBeNull()
  expect(resolveApiPath('/api/index?path=%2F%2Fexample.com')).toBeNull()
})

it('accepts the original V1 URL when Vercel forwards it to the function', () => {
  expect(resolveApiPath('/api/v1/session')).toBe('/api/v1/session')
  expect(resolveApiPath('/api/v1/dashboard?serviceId=9ff41440-0d63-428e-ad12-039d0c244ca8'))
    .toBe('/api/v1/dashboard?serviceId=9ff41440-0d63-428e-ad12-039d0c244ca8')
  expect(resolveApiPath('/api/v1/..%2F..%2Fadmin')).toBeNull()
  expect(resolveApiPath('/api/v1/')).toBeNull()
})

it('preserves report filters and CSV extensions when routing through Vercel', () => {
  expect(resolveApiPath('/api/index?path=dashboard&serviceId=9ff41440-0d63-428e-ad12-039d0c244ca8'))
    .toBe('/api/v1/dashboard?serviceId=9ff41440-0d63-428e-ad12-039d0c244ca8')
  expect(resolveApiPath('/api/index?path=reports/attendance.csv&serviceId=9ff41440-0d63-428e-ad12-039d0c244ca8'))
    .toBe('/api/v1/reports/attendance.csv?serviceId=9ff41440-0d63-428e-ad12-039d0c244ca8')
  expect(resolveApiPath('/api/index?path=reports/.hidden')).toBeNull()
})
