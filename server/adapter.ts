export function resolveApiPath(incomingUrl: string): string | null {
  const url = new URL(incomingUrl, 'https://church.invalid')
  if (url.pathname.startsWith('/api/v1/')) {
    const path = url.pathname.slice('/api/v1/'.length).replace(/\/+$/, '')
    if (!isSafeApiPath(path)) return null
    return `/api/v1/${path}${url.search}`
  }
  if (url.pathname !== '/api/index') return null
  const path = url.searchParams.get('path')
  if (!path || !isSafeApiPath(path)) return null
  url.searchParams.delete('path')
  const query = url.searchParams.toString()
  return `/api/v1/${path}${query ? `?${query}` : ''}`
}

function isSafeApiPath(path: string): boolean {
  return /^[a-zA-Z0-9/_.-]+$/.test(path) && !path.startsWith('/') && !path.startsWith('.') &&
    !path.includes('//') && !path.includes('/.') && !path.includes('..')
}
