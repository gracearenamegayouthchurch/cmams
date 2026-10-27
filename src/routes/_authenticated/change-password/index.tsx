import { createFileRoute } from '@tanstack/react-router'
import { ChangePasswordPage } from '@/features/cmams/change-password'

export const Route = createFileRoute('/_authenticated/change-password/')({
  component: ChangePasswordPage,
})
