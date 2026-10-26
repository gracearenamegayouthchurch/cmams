import { ChartNoAxesCombined, CreditCard, LayoutDashboard, ScanLine, Users, UserRoundPlus, CalendarDays } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: { name: 'Church staff', email: 'Grace Arena', avatar: '' },
  teams: [{ name: 'Grace Arena', logo: ScanLine, plan: 'Member & attendance' }],
  navGroups: [{
    title: 'Church operations',
    items: [
      { title: 'Dashboard', url: '/', icon: LayoutDashboard },
      { title: 'Scan', url: '/scan', icon: ScanLine },
      { title: 'Registration', url: '/desk', icon: UserRoundPlus },
      { title: 'Directory', url: '/directory', icon: Users },
      { title: 'Services', url: '/services', icon: CalendarDays },
      { title: 'Cards', url: '/cards', icon: CreditCard },
      { title: 'Reports', url: '/reports', icon: ChartNoAxesCombined },
    ],
  }],
}
