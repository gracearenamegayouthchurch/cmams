import { createFileRoute, redirect } from '@tanstack/react-router'
import { ApiError, getSession } from '@/lib/cmams-api'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    try {
      const session = await getSession()
      if (
        session.staff.must_change_password &&
        !location.pathname.startsWith('/change-password')
      )
        throw redirect({ to: '/change-password' })
      if (
        session.staff.must_complete_profile &&
        !location.pathname.startsWith('/complete-profile') &&
        !location.pathname.startsWith('/change-password')
      )
        throw redirect({ to: '/complete-profile' })
      return session
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        throw redirect({ to: '/login' })
      throw error
    }
  },
  component: AuthenticatedLayout,
})
