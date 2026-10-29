import { createFileRoute } from '@tanstack/react-router'
import { FirstTimersPage } from '@/features/cmams/first-timers'

export const Route = createFileRoute('/_authenticated/first-timers/')({
  component: FirstTimersPage,
})
