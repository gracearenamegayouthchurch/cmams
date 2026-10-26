import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/features/cmams/dashboard'

export const Route = createFileRoute('/_authenticated/dashboard/')({
  component: DashboardPage,
})
