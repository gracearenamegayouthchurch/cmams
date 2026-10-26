import { expect, it } from 'vitest'
import { createScanLock } from './scan-lock'

it('holds identical decoded QR reads for three seconds', () => {
  const lock = createScanLock()
  expect(lock.accept('card', 1000)).toBe(true)
  expect(lock.accept('card', 2000)).toBe(false)
  expect(lock.accept('another', 2000)).toBe(true)
  expect(lock.accept('card', 4001)).toBe(true)
})
