import { expect, it } from 'vitest'
import { normalizePhone } from './phone.js'

it('normalizes Nigerian numbers entered with a leading zero after the country code', () => {
  expect(normalizePhone('+23408031234567')).toBe('+2348031234567')
  expect(normalizePhone('23408031234567')).toBe('+2348031234567')
  expect(normalizePhone('+234 (0803) 123-4567')).toBe('+2348031234567')
})

it('normalizes local Nigerian numbers and leaves valid international numbers alone', () => {
  expect(normalizePhone('08031234567')).toBe('+2348031234567')
  expect(normalizePhone('+2348031234567')).toBe('+2348031234567')
  expect(normalizePhone('2348031234567')).toBe('+2348031234567')
  expect(normalizePhone('+44 7911 123456')).toBe('+447911123456')
})
