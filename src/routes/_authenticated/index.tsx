import { createFileRoute, redirect } from '@tanstack/react-router'
import { homeForRole } from '@/features/cmams/access'

export const Route = createFileRoute('/_authenticated/')({
  beforeLoad: ({ context }) => {
    throw redirect({ to: homeForRole[context.staff.role] as '/dashboard' })
  },
})
