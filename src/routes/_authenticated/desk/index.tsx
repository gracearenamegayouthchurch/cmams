import { createFileRoute } from '@tanstack/react-router'
import { DeskPage } from '@/features/cmams/pages'
export const Route = createFileRoute('/_authenticated/desk/')({ component: DeskPage })
