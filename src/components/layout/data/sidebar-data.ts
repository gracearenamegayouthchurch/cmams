import {
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  LayoutDashboard,
  ScanLine,
  Sparkles,
  UserRoundPlus,
  Users,
  ShieldCheck,
  ListChecks,
  TrendingUp,
  UsersRound,
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
        { title: 'Analytics', url: '/analytics', icon: TrendingUp },
        { title: 'Scan', url: '/scan', icon: ScanLine },
        { title: 'Registration', url: '/desk', icon: UserRoundPlus },
        { title: 'First-Timers', url: '/first-timers', icon: Sparkles },
        { title: 'Cells', url: '/cells', icon: UsersRound },
        { title: 'Members', url: '/members', icon: Users },
        { title: 'Services', url: '/services', icon: CalendarDays },
        { title: 'Cards', url: '/cards', icon: CreditCard },
        { title: 'Reports', url: '/reports', icon: ChartNoAxesCombined },
        { title: 'Staff', url: '/staff', icon: ShieldCheck },
        { title: 'Catalogs', url: '/catalogs', icon: ListChecks },
      ],
    },
  ],
}
