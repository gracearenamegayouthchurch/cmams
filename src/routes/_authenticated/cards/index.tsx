import { createFileRoute } from '@tanstack/react-router'
import { CardsPage } from '@/features/cmams/pages'
export const Route = createFileRoute('/_authenticated/cards/')({ component: CardsPage })
