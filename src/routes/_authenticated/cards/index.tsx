import { createFileRoute } from '@tanstack/react-router'
import { CardsPage } from '@/features/cmams/cards'

export const Route = createFileRoute('/_authenticated/cards/')({
  component: CardsPage,
})
