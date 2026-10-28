import { type Staff } from '@/lib/cmams-api'

export const homeForRole: Record<Staff['role'], string> = {
  USHER_SCANNER: '/scan',
  REGISTRATION_DESK: '/desk',
  SERVICE_SUPERVISOR: '/services',
  ADMIN: '/dashboard',
  PASTOR_VIEWER: '/dashboard',
  CELL_LEADER: '/cells',
}

const access: Record<Staff['role'], string[]> = {
  USHER_SCANNER: ['Scan'],
  REGISTRATION_DESK: ['Scan', 'Registration', 'Members'],
  SERVICE_SUPERVISOR: [
    'Dashboard',
    'Scan',
    'Registration',
    'Members',
    'Services',
    'Cards',
  ],
  ADMIN: [
    'Dashboard',
    'Scan',
    'Registration',
    'Members',
    'Services',
    'Cards',
    'Reports',
    'Staff',
    'Catalogs',
    'Cells',
  ],
  PASTOR_VIEWER: ['Dashboard', 'Members', 'Reports', 'Cells'],
  CELL_LEADER: ['Cells'],
}

export function visibleNavigation(role: Staff['role']): string[] {
  return access[role] ?? []
}
