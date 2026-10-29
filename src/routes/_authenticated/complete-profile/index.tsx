import { createFileRoute } from '@tanstack/react-router'
import { CompleteProfilePage } from '@/features/cmams/complete-profile'

export const Route = createFileRoute('/_authenticated/complete-profile/')({
  component: CompleteProfilePage,
})
