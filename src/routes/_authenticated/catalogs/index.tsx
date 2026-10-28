import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSession } from '@/lib/cmams-api'
import { homeForRole } from '@/features/cmams/access'
import { CatalogsPage } from '@/features/cmams/catalogs'

export const Route = createFileRoute('/_authenticated/catalogs/')({
  beforeLoad: async () => {
    const { staff } = await getSession()
    if (staff.role !== 'ADMIN')
      throw redirect({ to: homeForRole[staff.role] as '/' })
  },
  component: CatalogsPage,
})
