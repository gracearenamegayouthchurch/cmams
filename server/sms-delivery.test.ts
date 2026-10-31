import { expect, it } from 'vitest'
import { deliveryState, refreshDelivery, resendWelcome } from './sms.js'

it('maps only explicit provider success to delivered and known failures to failed', () => {
  expect(deliveryState('delivrd')).toBe('DELIVERED')
  expect(deliveryState('delivered')).toBe('DELIVERED')
  expect(deliveryState('success')).toBe('DELIVERED')
  expect(deliveryState('undeliv')).toBe('FAILED')
  expect(deliveryState('expired')).toBe('FAILED')
  expect(deliveryState('sent awaiting status')).toBe('PENDING')
  expect(deliveryState('queued')).toBe('PENDING')
})

it('returns the raw provider status with the mapped delivery state', async () => {
  const db = { query: async (sql: string) => {
    if (sql.includes('SELECT provider_id')) return { rows: [{ provider_id: 'provider-1' }] }
    if (sql.includes('RETURNING delivery_state,provider_status')) return { rows: [{ delivery_state: 'FAILED', provider_status: 'undeliv' }] }
    return { rows: [] }
  } }
  await expect(refreshDelivery(db as never, '11111111-1111-4111-8111-111111111111', async () => 'undeliv'))
    .resolves.toEqual({ deliveryState: 'FAILED', providerStatus: 'undeliv' })
})

it('refuses resend unless the latest attempt is confirmed failed', async () => {
  const db = { query: async () => ({ rows: [{ id: 'job', recipient: '2348031234567', body: 'Welcome', delivery_state: 'PENDING' }] }) }
  await expect(resendWelcome(db as never, '11111111-1111-4111-8111-111111111111', 'admin', async () => ({ id: 'new' }))).rejects.toMatchObject({ status: 409 })
})

it('resends a failed message and records the attempt only after provider acceptance', async () => {
  const statements: { sql: string; params?: unknown[] }[] = []
  const db = { query: async (sql: string, params?: unknown[]) => {
    statements.push({ sql, params })
    if (sql.includes('FROM sms_settings')) return { rows: [{ enabled: true, welcome_mode: 'MANUAL', daily_time: '09:00', welcome_template: 'Welcome' }] }
    if (sql.includes('FROM sms_outbox')) return { rows: [{ id: '11111111-1111-4111-8111-111111111111', recipient: '2348031234567', body: 'Welcome', status: 'SENT', delivery_state: 'FAILED', provider_id: 'old' }] }
    if (sql.startsWith('UPDATE sms_outbox')) return { rows: [{ id: '11111111-1111-4111-8111-111111111111', recipient: '2348031234567', body: 'Welcome' }] }
    return { rows: [] }
  } }
  await expect(resendWelcome(db as never, '11111111-1111-4111-8111-111111111111', 'admin', async () => ({ id: 'new' }))).resolves.toBe('SENT')
  const attempt = statements.find(({ sql }) => sql.includes('INSERT INTO sms_attempts'))
  expect(attempt?.params).toEqual(['11111111-1111-4111-8111-111111111111', 'admin', '2348031234567', 'Welcome', 'new', 'SENT', null])
})
