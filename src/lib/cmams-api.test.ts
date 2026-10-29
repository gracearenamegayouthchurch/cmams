import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiError } from './cmams-api'

afterEach(() => vi.unstubAllGlobals())

it('never treats an unavailable server as successful registration', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  await expect(
    api('/api/v1/people', { method: 'POST', body: '{}' })
  ).rejects.toThrow('offline')
})

it('times out a hung request instead of leaving the scanner frozen', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        })
    )
  )

  let raceTimer: ReturnType<typeof setTimeout> | undefined
  const outcome = await Promise.race([
    api('/api/v1/services/x/check-ins', { method: 'POST', body: '{}' }, 10).then(
      () => ({ status: 'resolved' as const }),
      (error: unknown) => ({ status: 'rejected' as const, error })
    ),
    new Promise<{ status: 'pending' }>((resolve) => {
      raceTimer = setTimeout(() => resolve({ status: 'pending' }), 1000)
    }),
  ])
  if (raceTimer) clearTimeout(raceTimer)

  expect(outcome.status).toBe('rejected')
  if (outcome.status === 'rejected') {
    expect(outcome.error).toBeInstanceOf(ApiError)
    expect(outcome.error).toMatchObject({ code: 'TIMEOUT', status: 0 })
  }
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
