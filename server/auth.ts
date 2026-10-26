import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { roles, type StaffRole } from './rbac'

const scrypt = promisify(nodeScrypt)
export type Session = { id: string; role: StaffRole }

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error('Staff passwords must contain at least 12 characters')
  const salt = randomBytes(16).toString('hex')
  const digest = (await scrypt(password, salt, 64)) as Buffer
  return `${salt}:${digest.toString('hex')}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hex] = encoded.split(':')
  if (!salt || !hex || !/^[0-9a-f]{128}$/i.test(hex)) return false
  const expected = Buffer.from(hex, 'hex')
  const actual = (await scrypt(password, salt, expected.length)) as Buffer
  return timingSafeEqual(actual, expected)
}

function mac(value: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(value).digest()
}

export function signSession(session: Session, secret: string, now = Date.now()): string {
  if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
  const payload = Buffer.from(JSON.stringify({ ...session, exp: now + 8 * 60 * 60 * 1000 })).toString('base64url')
  return `${payload}.${mac(payload, secret).toString('base64url')}`
}

export function readSession(token: string | undefined, secret: string, now = Date.now()): Session | null {
  if (!token || secret.length < 32) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  const received = Buffer.from(signature, 'base64url')
  const expected = mac(payload, secret)
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data !== 'object' || !data) return null
    const { id, role, exp } = data as Record<string, unknown>
    if (typeof id !== 'string' || !roles.includes(role as StaffRole) || typeof exp !== 'number' || exp <= now) return null
    return { id, role: role as StaffRole }
  } catch { return null }
}
