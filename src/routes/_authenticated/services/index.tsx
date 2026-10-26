import { createFileRoute } from '@tanstack/react-router'
import { ServicesPage } from '@/features/cmams/services'

export const Route = createFileRoute('/_authenticated/services/')({
  component: ServicesPage,
})
