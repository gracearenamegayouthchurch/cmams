import { createFileRoute } from '@tanstack/react-router'
import { ReportsPage } from '@/features/cmams/pages'
export const Route = createFileRoute('/_authenticated/reports/')({ component: ReportsPage })
