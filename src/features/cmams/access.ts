import { type Staff } from '@/lib/cmams-api'

export const homeForRole: Record<Staff['role'], string> = {
  REGISTRATION_DESK: '/desk',
  SERVICE_SUPERVISOR: '/services',
  ADMIN: '/dashboard',
  PASTOR_VIEWER: '/dashboard',
  CELL_LEADER: '/cells',
}

const access: Record<Staff['role'], string[]> = {
  REGISTRATION_DESK: ['Scan', 'Registration', 'First-Timers', 'Members'],
  SERVICE_SUPERVISOR: [
    'Dashboard',
    'Analytics',
    'Scan',
    'Registration',
    'First-Timers',
    'Members',
    'Services',
    'Cards',
  ],
  ADMIN: [
    'Dashboard',
    'Analytics',
    'Scan',
    'Registration',
    'First-Timers',
    'Members',
    'Services',
    'Cards',
    'Reports',
    'Staff',
    'Catalogs',
    'Cells',
  ],
  PASTOR_VIEWER: [
    'Dashboard',
    'Analytics',
    'First-Timers',
    'Members',
    'Reports',
    'Cells',
  ],
  CELL_LEADER: ['Cells'],
}

export function visibleNavigation(role: Staff['role']): string[] {
  return access[role] ?? []
}
