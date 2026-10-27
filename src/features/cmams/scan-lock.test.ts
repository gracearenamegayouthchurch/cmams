import { expect, it } from 'vitest'
import { createScanLock } from './scan-lock'

it('holds identical decoded QR reads for three seconds', () => {
  const lock = createScanLock()
  expect(lock.accept('card', 1000)).toBe(true)
  expect(lock.accept('card', 2000)).toBe(false)
  expect(lock.accept('another', 2000)).toBe(true)
  expect(lock.accept('card', 4001)).toBe(true)
})

it('allows an immediate retry of a scan that failed before an outcome was confirmed', () => {
  const lock = createScanLock()
  expect(lock.accept('9K4-M7X', 1000)).toBe(true)
  lock.release('9K4-M7X')
  expect(lock.accept('9K4-M7X', 1001)).toBe(true)
})
