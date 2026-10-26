import { describe, expect, it } from 'vitest'
import { sidebarData } from './sidebar-data'

describe('CMAMS navigation', () => {
  it('shows only the church operations', () => {
    const links = sidebarData.navGroups.flatMap((group) =>
      group.items.map((item) => item.title)
    )
    expect(links).toEqual([
      'Dashboard',
      'Scan',
      'Registration',
      'Directory',
      'Services',
      'Cards',
      'Reports',
    ])
  })
})
