export function resolveApiPath(incomingUrl: string): string | null {
  const url = new URL(incomingUrl, 'https://church.invalid')
  if (url.pathname !== '/api/index') return null
  const path = url.searchParams.get('path')
  if (!path || !/^[a-zA-Z0-9/_.-]+$/.test(path) || path.startsWith('/') || path.startsWith('.') || path.includes('//') || path.includes('/.') || path.includes('..')) return null
  url.searchParams.delete('path')
  const query = url.searchParams.toString()
  return `/api/v1/${path}${query ? `?${query}` : ''}`
}
