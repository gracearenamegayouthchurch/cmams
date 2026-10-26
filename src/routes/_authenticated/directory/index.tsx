import { createFileRoute } from '@tanstack/react-router'
import { DirectoryPage } from '@/features/cmams/pages'
export const Route = createFileRoute('/_authenticated/directory/')({ component: DirectoryPage })
