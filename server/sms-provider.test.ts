import { afterEach, expect, it, vi } from 'vitest'
import { fetchDeliveryStatus, sendBulkSms } from './sms-provider.js'

afterEach(() => { vi.unstubAllGlobals(); delete process.env.BULKSMS_API_TOKEN; delete process.env.BULKSMS_SENDER_ID })

it('refuses to contact the provider without token and approved sender configuration', async () => {
  const fetcher = vi.fn()
  await expect(sendBulkSms('2348031234567', 'Welcome', fetcher)).rejects.toThrow('not configured')
  expect(fetcher).not.toHaveBeenCalled()
})

it('posts one SMS to the production v2 API with a server-only bearer token', async () => {
  process.env.BULKSMS_API_TOKEN = 'secret-token'
  process.env.BULKSMS_SENDER_ID = 'GAMYC'
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'success', code: 'BSNG-0000', data: { message_id: 'provider-1' } }), { status: 200 }))
  await expect(sendBulkSms('2348031234567', 'Welcome', fetcher)).resolves.toEqual({ id: 'provider-1' })
  const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('https://www.bulksmsnigeria.com/api/v2/sms')
  expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
  expect(JSON.parse(String(init.body))).toMatchObject({ from: 'GAMYC', to: '2348031234567', body: 'Welcome' })
})

it('treats a documented duplicate response as rejected without retrying', async () => {
  process.env.BULKSMS_API_TOKEN = 'secret-token'
  process.env.BULKSMS_SENDER_ID = 'GAMYC'
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'error', code: 'BSNG-2012' }), { status: 409 }))
  await expect(sendBulkSms('2348031234567', 'Welcome', fetcher)).rejects.toMatchObject({ status: 422 })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('reads the latest delivery report for a provider message', async () => {
  process.env.BULKSMS_API_TOKEN = 'secret-token'
  process.env.BULKSMS_SENDER_ID = 'GAMYC'
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    status: 'success',
    data: { reports: [{ recipient: '2348031234567', delivery_status: 'delivrd' }] },
  }), { status: 200 }))
  await expect(fetchDeliveryStatus('provider-1', fetcher)).resolves.toBe('delivrd')
  const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('https://www.bulksmsnigeria.com/api/v2/delivery-reports?message_id=provider-1')
  expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
})

it('returns pending when the provider has no delivery report yet', async () => {
  process.env.BULKSMS_API_TOKEN = 'secret-token'
  process.env.BULKSMS_SENDER_ID = 'GAMYC'
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: { reports: [] } }), { status: 200 }))
  await expect(fetchDeliveryStatus('provider-1', fetcher)).resolves.toBe('sent awaiting status')
})

it('does not treat a mixed delivered and failed report as a safe resend', async () => {
  process.env.BULKSMS_API_TOKEN = 'secret-token'
  process.env.BULKSMS_SENDER_ID = 'GAMYC'
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    status: 'success',
    data: { reports: [{ delivery_status: 'delivrd' }, { delivery_status: 'undeliv' }] },
  }), { status: 200 }))
  await expect(fetchDeliveryStatus('provider-1', fetcher)).resolves.toBe('sent awaiting status')
})

it('refuses a delivery-report lookup without configuration or with a provider error', async () => {
  const fetcher = vi.fn()
  await expect(fetchDeliveryStatus('provider-1', fetcher)).rejects.toThrow('not configured')
  expect(fetcher).not.toHaveBeenCalled()
  process.env.BULKSMS_API_TOKEN = 'secret-token'
  process.env.BULKSMS_SENDER_ID = 'GAMYC'
  const failing = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'error' }), { status: 503 }))
  await expect(fetchDeliveryStatus('provider-1', failing)).rejects.toMatchObject({ status: 503 })
})
