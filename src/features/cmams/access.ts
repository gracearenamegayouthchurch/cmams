import { type Staff } from '@/lib/cmams-api'

export const homeForRole: Record<Staff['role'], string> = {
  USHER_SCANNER: '/scan',
  REGISTRATION_DESK: '/desk',
  SERVICE_SUPERVISOR: '/services',
  ADMIN: '/dashboard',
  PASTOR_VIEWER: '/dashboard',
}

const access: Record<Staff['role'], string[]> = {
  USHER_SCANNER: ['Scan'],
  REGISTRATION_DESK: ['Scan', 'Registration', 'Directory'],
  SERVICE_SUPERVISOR: [
    'Dashboard',
    'Scan',
    'Registration',
    'Directory',
    'Services',
    'Cards',
  ],
  ADMIN: [
    'Dashboard',
    'Scan',
    'Registration',
    'Directory',
    'Services',
    'Cards',
    'Reports',
  ],
  PASTOR_VIEWER: ['Dashboard', 'Directory', 'Reports'],
}

export function visibleNavigation(role: Staff['role']): string[] {
  return access[role] ?? []
}
