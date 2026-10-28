export const roles = ['USHER_SCANNER', 'REGISTRATION_DESK', 'SERVICE_SUPERVISOR', 'ADMIN', 'PASTOR_VIEWER', 'CELL_LEADER'] as const
export type StaffRole = (typeof roles)[number]
export type Capability = 'checkin' | 'directory' | 'register' | 'manual' | 'cards' | 'services' | 'dashboard' | 'export' | 'staff' | 'cell_manage' | 'cell_read' | 'cell_meeting'

const permissions: Record<StaffRole, readonly Capability[]> = {
  USHER_SCANNER: ['checkin'],
  REGISTRATION_DESK: ['checkin', 'directory', 'register', 'manual'],
  SERVICE_SUPERVISOR: ['checkin', 'directory', 'register', 'manual', 'cards', 'services', 'dashboard'],
  ADMIN: ['checkin', 'directory', 'register', 'manual', 'cards', 'services', 'dashboard', 'export', 'staff', 'cell_manage', 'cell_read', 'cell_meeting'],
  PASTOR_VIEWER: ['directory', 'dashboard', 'export', 'cell_manage', 'cell_read', 'cell_meeting'],
  CELL_LEADER: ['cell_read', 'cell_meeting'],
}

export function allow(role: StaffRole, action: Capability): boolean { return permissions[role]?.includes(action) ?? false }

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  if (phone.length < 6) return '*'.repeat(phone.length)
  return `${phone.slice(0, -7)}*****${phone.slice(-2)}`
}
