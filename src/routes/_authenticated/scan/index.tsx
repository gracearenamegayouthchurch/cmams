import { createFileRoute } from '@tanstack/react-router'
import { ScanPage } from '@/features/cmams/scan'

export const Route = createFileRoute('/_authenticated/scan/')({
  component: ScanPage,
})
