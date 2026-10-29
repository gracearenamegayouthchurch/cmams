export type Staff = {
  id: string
  full_name: string
  email: string
  role:
    | 'REGISTRATION_DESK'
    | 'SERVICE_SUPERVISOR'
    | 'ADMIN'
    | 'PASTOR_VIEWER'
    | 'CELL_LEADER'
  must_change_password?: boolean
  must_complete_profile?: boolean
  person_id?: string | null
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 12_000
): Promise<T> {
  if (!path.startsWith('/api/v1/')) throw new Error('Unexpected API path')
  const controller = new AbortController()
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  const abort = () => controller.abort()
  if (init.signal) {
    if (init.signal.aborted) abort()
    else init.signal.addEventListener('abort', abort, { once: true })
  }
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch (reason) {
    if (controller.signal.aborted && !init.signal?.aborted)
      throw new ApiError(
        'The server did not respond. Check the connection and try again.',
        0,
        'TIMEOUT'
      )
    throw reason
  } finally {
    if (timer) clearTimeout(timer)
    init.signal?.removeEventListener('abort', abort)
  }
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null)
    const message =
      typeof result === 'object' &&
      result &&
      'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : `Request failed (${response.status})`
    const code =
      typeof result === 'object' &&
      result &&
      'code' in result &&
      typeof result.code === 'string'
        ? result.code
        : undefined
    throw new ApiError(message, response.status, code)
  }
  return response.json() as Promise<T>
}

export function getSession(): Promise<{ staff: Staff }> {
  return api('/api/v1/session')
}
