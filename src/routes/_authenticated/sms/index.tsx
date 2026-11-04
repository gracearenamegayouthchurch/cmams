import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSession } from '@/lib/cmams-api'
import { homeForRole } from '@/features/cmams/access'
import { SmsPage } from '@/features/cmams/sms'

export const Route = createFileRoute('/_authenticated/sms/')({
  beforeLoad: async () => {
    const { staff } = await getSession()
    if (staff.role !== 'ADMIN')
      throw redirect({ to: homeForRole[staff.role] as '/' })
  },
  component: SmsPage,
})
