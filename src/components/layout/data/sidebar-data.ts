import {
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  LayoutDashboard,
  ScanLine,
  UserRoundPlus,
  Users,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: { name: 'Grace Arena Staff', email: 'Grace Arena', avatar: '' },
  teams: [{ name: 'Grace Arena', logo: ScanLine, plan: 'Mega Youth Church' }],
  navGroups: [
    {
      title: 'Navigation',
      items: [
        { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
        { title: 'Scan', url: '/scan', icon: ScanLine },
        { title: 'Registration', url: '/desk', icon: UserRoundPlus },
        { title: 'Members', url: '/members', icon: Users },
        { title: 'Services', url: '/services', icon: CalendarDays },
        { title: 'Cards', url: '/cards', icon: CreditCard },
        { title: 'Reports', url: '/reports', icon: ChartNoAxesCombined },
      ],
    },
  ],
}
