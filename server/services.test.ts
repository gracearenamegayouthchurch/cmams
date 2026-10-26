import { expect, it } from 'vitest'
import { validateService, changeServiceStatus } from './services'

it('rejects a service with a closing time before its opening time', () => {
  expect(() => validateService({ name: 'Sunday service', category: 'SUNDAY_SERVICE', scheduledStartAt: '2026-11-01T09:00:00Z', opensAt: '2026-11-01T10:00:00Z', closesAt: '2026-11-01T09:00:00Z' })).toThrow()
})

it('does not reopen a closed service', async () => {
  const query = async () => ({ rows: [] })
  await expect(changeServiceStatus({ query } as never, 'service', 'open')).rejects.toThrow('Invalid service transition')
})
