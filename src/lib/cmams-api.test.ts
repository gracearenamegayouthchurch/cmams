import { afterEach, expect, it, vi } from 'vitest'
import { api } from './cmams-api'

afterEach(() => vi.unstubAllGlobals())

it('never treats an unavailable server as successful registration', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  await expect(
    api('/api/v1/people', { method: 'POST', body: '{}' })
  ).rejects.toThrow('offline')
})

it('includes staff cookies on same-origin requests', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', fetcher)
  expect(await api<{ ok: boolean }>('/api/v1/session')).toEqual({ ok: true })
  expect(fetcher.mock.calls[0][1].credentials).toBe('same-origin')
})
