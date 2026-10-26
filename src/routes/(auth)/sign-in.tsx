import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/features/cmams/login'

const searchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/sign-in')({
  component: LoginPage,
  validateSearch: searchSchema,
})
