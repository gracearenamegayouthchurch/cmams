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
import { formatRole } from '@/features/cmams/format'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppSidebar({ staff }: { staff: Staff }) {
  const { collapsible, variant } = useLayout()
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader className='border-b border-sidebar-border pb-3'>
        <div className='flex items-center gap-3 px-2 pt-1'>
          <img
            src='/images/gamyc-emblem.png'
            alt='GAMYC'
            className='size-9 shrink-0 object-contain drop-shadow-xs'
          />
          <span className='grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden'>
            <strong className='truncate text-sm font-semibold tracking-tight text-sidebar-foreground'>
              Grace Arena
            </strong>
            <span className='truncate text-xs text-sidebar-foreground/65'>
              Mega Youth Church
            </span>
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className='pt-2'>
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
      <SidebarFooter className='border-t border-sidebar-border p-3'>
        <div className='flex items-center gap-2.5 overflow-hidden px-1'>
          <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sky-700 dark:text-sky-300'>
            {initials(staff.full_name) || 'GA'}
          </span>
          <div className='grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden'>
            <span className='truncate text-xs font-medium text-sidebar-foreground'>
              {staff.full_name}
            </span>
            <span className='truncate text-[11px] text-sidebar-foreground/65'>
              {formatRole(staff.role)}
            </span>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
