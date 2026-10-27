import { expect, it } from 'vitest'
import { visibleNavigation } from './access'

it('shows an usher only the scan operation', () => {
  expect(visibleNavigation('USHER_SCANNER')).toEqual(['Scan'])
  expect(visibleNavigation('PASTOR_VIEWER')).toEqual([
    'Dashboard',
    'Members',
    'Reports',
  ])
})

it('shows staff management only to administrators', () => {
  expect(visibleNavigation('ADMIN')).toContain('Staff')
  for (const role of [
    'USHER_SCANNER',
    'REGISTRATION_DESK',
    'SERVICE_SUPERVISOR',
    'PASTOR_VIEWER',
  ] as const)
    expect(visibleNavigation(role)).not.toContain('Staff')
})
