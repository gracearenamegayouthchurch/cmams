import { expect, it } from 'vitest'
import { visibleNavigation } from './access'

it('shows the registration desk scan, registration, first-timers, and members', () => {
  expect(visibleNavigation('REGISTRATION_DESK')).toEqual([
    'Scan',
    'Registration',
    'First-Timers',
    'Members',
  ])
  expect(visibleNavigation('PASTOR_VIEWER')).toEqual([
    'Dashboard',
    'Analytics',
    'First-Timers',
    'Members',
    'Reports',
    'Cells',
  ])
  expect(visibleNavigation('SERVICE_SUPERVISOR')).toContain('Analytics')
  expect(visibleNavigation('SERVICE_SUPERVISOR')).toContain('First-Timers')
  expect(visibleNavigation('CELL_LEADER')).not.toContain('Analytics')
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
