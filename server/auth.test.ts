import { describe, expect, it } from 'vitest'
import { allow, maskPhone } from './rbac.js'
import { hashPassword, verifyPassword, signSession, readSession } from './auth.js'

const secret = 'a'.repeat(64)

describe('staff security', () => {
  it('denies scanner staff access to member search and reports', () => {
    expect(allow('USHER_SCANNER', 'checkin')).toBe(true)
    expect(allow('USHER_SCANNER', 'directory')).toBe(false)
    expect(allow('USHER_SCANNER', 'export')).toBe(false)
    expect(allow('PASTOR_VIEWER', 'checkin')).toBe(false)
  })

  it('keeps cell leaders out of global services and member reports', () => {
    expect(allow('CELL_LEADER', 'cell_read')).toBe(true)
    expect(allow('CELL_LEADER', 'cell_meeting')).toBe(true)
    expect(allow('CELL_LEADER', 'directory')).toBe(false)
    expect(allow('CELL_LEADER', 'services')).toBe(false)
    expect(allow('CELL_LEADER', 'checkin')).toBe(false)
    expect(allow('CELL_LEADER', 'export')).toBe(false)
    expect(allow('PASTOR_VIEWER', 'cell_manage')).toBe(true)
  })

  it('masks contact numbers for ordinary directory readers', () => {
    expect(maskPhone('+2348031234592')).toBe('+234803*****92')
  })

  it('never accepts a different password', async () => {
    const hash = await hashPassword('a long staff password')
    expect(await verifyPassword('a long staff password', hash)).toBe(true)
    expect(await verifyPassword('not the same password', hash)).toBe(false)
  })

  it('refuses tampered and expired session cookies', () => {
    const token = signSession({ id: '123', role: 'ADMIN' }, secret, 1000)
    expect(readSession(token, secret, 1001)?.id).toBe('123')
    expect(readSession(token + 'x', secret, 1001)).toBeNull()
    expect(readSession(token, secret, 1_000 + 86_400_001)).toBeNull()
  })
})
