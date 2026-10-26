import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleApi } from '../server/app'
import { resolveApiPath } from '../server/adapter'

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const path = resolveApiPath(req.url ?? '')
  if (!path) { res.writeHead(404).end(); return }
  try {
    const host = req.headers.host ?? 'localhost'
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    const body = ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : jsonBody(req.body ?? await readBody(req))
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined && key !== 'content-length') headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    const response = await handleApi(new Request(`${protocol}://${host}${path}`, { method: req.method, headers, body }))
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.statusCode = error instanceof Error && error.message === 'Request is too large' ? 413 : 400
    res.end(JSON.stringify({ error: res.statusCode === 413 ? 'Request is too large' : 'Invalid request' }))
  }
}

export function jsonBody(body: unknown): string {
  const content = typeof body === 'string' ? body : Buffer.isBuffer(body) ? body.toString('utf8') : JSON.stringify(body)
  if (Buffer.byteLength(content) > 65536) throw new Error('Request is too large')
  return content
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const part = Buffer.from(chunk)
    size += part.length
    if (size > 65536) throw new Error('Request is too large')
    chunks.push(part)
  }
  const content = Buffer.concat(chunks).toString('utf8')
  return content ? JSON.parse(content) : {}
}
