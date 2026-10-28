import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSession } from '@/lib/cmams-api'
import { homeForRole } from '@/features/cmams/access'
import { CellsPage } from '@/features/cmams/cells'

export const Route = createFileRoute('/_authenticated/cells/')({
  beforeLoad: async () => {
    const { staff } = await getSession()
    if (
      staff.role !== 'ADMIN' &&
      staff.role !== 'PASTOR_VIEWER' &&
      staff.role !== 'CELL_LEADER'
    )
      throw redirect({ to: homeForRole[staff.role] as '/' })
  },
  component: CellsPage,
})
