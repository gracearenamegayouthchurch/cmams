import { afterEach, expect, it, vi } from 'vitest'
import { sendBulkSms } from './sms-provider.js'

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
