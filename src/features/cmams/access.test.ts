import { expect, it } from 'vitest'
import { visibleNavigation } from './access'

it('shows the registration desk scan, registration and members', () => {
  expect(visibleNavigation('REGISTRATION_DESK')).toEqual([
    'Scan',
    'Registration',
    'Members',
  ])
  expect(visibleNavigation('PASTOR_VIEWER')).toEqual([
    'Dashboard',
    'Members',
    'Reports',
    'Cells',
  ])
})

it('shows staff management only to administrators', () => {
  expect(visibleNavigation('ADMIN')).toContain('Staff')
  for (const role of [
    'REGISTRATION_DESK',
    'SERVICE_SUPERVISOR',
    'PASTOR_VIEWER',
  ] as const)
    expect(visibleNavigation(role)).not.toContain('Staff')
})
