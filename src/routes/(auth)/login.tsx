import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/features/cmams/login'

export const Route = createFileRoute('/(auth)/login')({ component: LoginPage })
