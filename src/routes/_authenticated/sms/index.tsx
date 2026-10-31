import { createFileRoute } from '@tanstack/react-router'
import { SmsPage } from '@/features/cmams/sms'

export const Route = createFileRoute('/_authenticated/sms/')({
  component: SmsPage,
})
