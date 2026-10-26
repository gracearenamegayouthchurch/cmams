export function rewriteDevApi(incomingUrl: string): string | null {
  const url = new URL(incomingUrl, 'http://localhost')
  if (!url.pathname.startsWith('/api/v1/')) return null
  const routePath = url.pathname.slice('/api/v1/'.length).replace(/\/+$/, '')
  if (!routePath) return null
  const params = new URLSearchParams()
  params.set('path', routePath)
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'path') params.append(key, value)
  }
  return `/api/index?${params.toString()}`
}
