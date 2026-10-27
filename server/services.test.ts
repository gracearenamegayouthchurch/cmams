import { expect, it } from 'vitest'
import { validateService, changeServiceStatus } from './services.js'

it('rejects a service with a closing time before its opening time', () => {
  expect(() => validateService({ name: 'Sunday service', category: 'SUNDAY_SERVICE', scheduledStartAt: '2026-11-01T09:00:00Z', opensAt: '2026-11-01T10:00:00Z', closesAt: '2026-11-01T09:00:00Z' })).toThrow()
})

it('does not reopen a closed service', async () => {
  const query = async () => ({ rows: [] })
  await expect(changeServiceStatus({ query } as never, 'service', 'open')).rejects.toThrow('Invalid service transition')
})

it('reports when a scheduled check-in window has not begun', async () => {
  const query = async (sql: string) => ({ rows: sql.includes('SELECT status') ? [{ status: 'SCHEDULED', checkin_opens_at: '2026-11-01T06:00:00Z', checkin_closes_at: '2026-11-01T10:00:00Z', db_now: '2026-10-27T02:00:00Z' }] : [] })
  await expect(changeServiceStatus({ query } as never, 'service', 'open')).rejects.toMatchObject({ code: 'WINDOW_NOT_STARTED' })
})
