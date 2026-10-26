import { createFileRoute } from '@tanstack/react-router'
import { ServicesPage } from '@/features/cmams/pages'
export const Route = createFileRoute('/_authenticated/services/')({ component: ServicesPage })
