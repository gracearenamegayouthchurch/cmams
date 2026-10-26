import { createFileRoute, redirect } from '@tanstack/react-router'
import { ApiError, getSession } from '@/lib/cmams-api'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    try {
      return await getSession()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        throw redirect({ to: '/login' })
      throw error
    }
  },
  component: AuthenticatedLayout,
})
