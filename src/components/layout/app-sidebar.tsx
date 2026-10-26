import { ScanLine } from 'lucide-react'
import { type Staff } from '@/lib/cmams-api'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { visibleNavigation } from '@/features/cmams/access'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'

export function AppSidebar({ staff }: { staff: Staff }) {
  const { collapsible, variant } = useLayout()
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <div className='flex items-center gap-3 p-2'>
          <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-slate-950'>
            <ScanLine className='size-5' />
          </span>
          <span className='grid min-w-0'>
            <strong className='truncate text-sm text-sidebar-foreground'>
              Grace Arena
            </strong>
            <span className='truncate text-xs text-sidebar-foreground/70'>
              Member & attendance
            </span>
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((props) => (
          <NavGroup
            key={props.title}
            {...props}
            items={props.items.filter((item) =>
              visibleNavigation(staff.role).includes(item.title)
            )}
          />
        ))}
      </SidebarContent>
      <SidebarFooter className='px-4 py-3 text-xs text-sidebar-foreground/75'>
        {staff.full_name}
        <br />
        {staff.role.replace(/_/g, ' ')}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
