export type Staff = {
  id: string
  full_name: string
  email: string
  role:
    | 'USHER_SCANNER'
    | 'REGISTRATION_DESK'
    | 'SERVICE_SUPERVISOR'
    | 'ADMIN'
    | 'PASTOR_VIEWER'
    | 'CELL_LEADER'
  must_change_password?: boolean
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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/api/v1/')) throw new Error('Unexpected API path')
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })
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
