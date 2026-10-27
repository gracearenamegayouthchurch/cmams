import { type Staff } from '@/lib/cmams-api'
import { type Service } from './types'

const roleLabels: Record<Staff['role'], string> = {
  ADMIN: 'Administrator',
  SERVICE_SUPERVISOR: 'Service Supervisor',
  REGISTRATION_DESK: 'Registration Desk',
  USHER_SCANNER: 'Usher',
  PASTOR_VIEWER: 'Pastor',
}

export function formatRole(role: Staff['role']): string {
  return roleLabels[role] ?? role
}

const stageLabels: Record<string, string> = {
  FIRST_TIMER: 'First-timer',
  RETURNING_VISITOR: 'Returning visitor',
  REGULAR_ATTENDEE: 'Regular attendee',
  MEMBER: 'Member',
  INACTIVE: 'Inactive',
  ARCHIVED: 'Archived',
}

export function formatStage(stage: string): string {
  return stageLabels[stage] ?? stage.replace(/_/g, ' ').toLowerCase()
}

export function stageBadgeClass(stage: string): string {
  switch (stage) {
    case 'MEMBER':
      return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-200'
    case 'FIRST_TIMER':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200'
    case 'RETURNING_VISITOR':
      return 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800/70 dark:bg-indigo-950/50 dark:text-indigo-200'
    case 'REGULAR_ATTENDEE':
      return 'border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

const categoryLabels: Record<string, string> = {
  SUNDAY_SERVICE: 'Sunday service',
  MIDWEEK_SERVICE: 'Midweek service',
  DEPARTMENT_MEETING: 'Department meeting',
  SPECIAL_EVENT: 'Special event',
  LEADERSHIP_MEETING: 'Leadership meeting',
}

export function formatCategory(category: string): string {
  return categoryLabels[category] ?? category
}

const methodLabels: Record<string, string> = {
  QR_SCAN: 'QR scan',
  SHORTCODE_ENTRY: 'Card code',
  MANUAL_SEARCH: 'Desk check-in',
  VISITOR_DESK_REGISTRATION: 'Desk registration',
  QR_CAMERA: 'QR scan',
  QR_SCANNER: 'Scanner',
  SHORT_CODE: 'Card code',
  MANUAL_DESK: 'Desk check-in',
}

export function formatCheckinMethod(method: string): string {
  return methodLabels[method] ?? method.replace(/_/g, ' ').toLowerCase()
}

const statusLabels: Record<Service['status'], string> = {
  SCHEDULED: 'Scheduled',
  CHECKIN_OPEN: 'Check-in open',
  CHECKIN_CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
}

export function formatServiceStatus(
  status: Service['status'] | string
): string {
  return statusLabels[status as Service['status']] ?? status
}

export function serviceStatusClass(status: Service['status'] | string): string {
  switch (status) {
    case 'CHECKIN_OPEN':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200'
    case 'SCHEDULED':
      return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-200'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

export function formatServiceOption(service: Service): string {
  const date = new Date(service.scheduled_start_at).toLocaleDateString(
    undefined,
    { month: 'short', day: 'numeric', year: 'numeric' }
  )
  const suffix =
    service.status === 'CHECKIN_OPEN'
      ? ' · Open'
      : service.status === 'SCHEDULED'
        ? ' · Scheduled'
        : ''
  return `${service.name} — ${date}${suffix}`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const fmt: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
  return `${new Date(startIso).toLocaleTimeString(undefined, fmt)} – ${new Date(endIso).toLocaleTimeString(undefined, fmt)}`
}

export function describeScanOutcome(
  outcome: string,
  message?: string
): { heading: string; detail: string } {
  switch (outcome) {
    case 'CHECKED_IN':
      return { heading: 'Checked in', detail: 'Attendance recorded.' }
    case 'ALREADY_CHECKED_IN':
      return {
        heading: 'Already checked in',
        detail: 'Already recorded for this service.',
      }
    case 'CARD_NOT_RECOGNIZED':
      return {
        heading: 'Card not recognized',
        detail:
          'Check the 6-character code or refer this person to the registration desk.',
      }
    case 'CARD_REVOKED':
      return {
        heading: 'Card inactive',
        detail:
          'This card was replaced or revoked. Ask a supervisor to issue a new card.',
      }
    case 'SERVICE_CLOSED':
      return {
        heading: 'Check-in closed',
        detail: 'This service is not currently open for check-in.',
      }
    case 'PERSON_INACTIVE':
      return {
        heading: 'Profile inactive',
        detail: 'Refer this person to the registration desk.',
      }
    case 'NETWORK_ERROR':
      return {
        heading: 'Not checked in',
        detail:
          message || 'Connection error. Check your network and try again.',
      }
    default:
      return {
        heading: 'Not checked in',
        detail: message || 'Unable to verify this card.',
      }
  }
}
