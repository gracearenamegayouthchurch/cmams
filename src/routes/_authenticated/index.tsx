import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/features/cmams/pages'

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
})
