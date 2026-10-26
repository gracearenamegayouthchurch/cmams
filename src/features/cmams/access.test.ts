import { expect, it } from 'vitest'
import { visibleNavigation } from './access'

it('shows an usher only the scan operation', () => {
  expect(visibleNavigation('USHER_SCANNER')).toEqual(['Scan'])
  expect(visibleNavigation('PASTOR_VIEWER')).toEqual([
    'Dashboard',
    'Directory',
    'Reports',
  ])
})
