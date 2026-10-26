import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { ApiError } from '@/lib/cmams-api'
import { ThemeProvider } from '@/context/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { CardDownloads } from './cards'
import { DashboardPage } from './dashboard'
import { DeskPage } from './desk'
import { LoginPage } from './login'
import { QueryState } from './query-state'
import { ScanPage } from './scan'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderWithShell(element: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ThemeProvider>
        <SidebarProvider>{element}</SidebarProvider>
      </ThemeProvider>
    ),
  })
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <div>Login screen</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('CMAMS browser workflows', () => {
  it('shows a clear sign-in error when credentials are rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'Invalid credentials' }, 401))
    )
    const screen = await renderWithShell(<LoginPage />)
    await userEvent.type(
      screen.getByLabelText(/staff email/i),
      'usher@example.com'
    )
    await userEvent.type(
      screen.getByLabelText(/password/i),
      'wrong-password-123'
    )
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Invalid credentials')
  })

  it('requires informed consent and surfaces duplicate matches at the registration desk', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/v1/services'))
          return jsonResponse({ services: [] })
        if (url.includes('/api/v1/people/duplicates')) {
          return jsonResponse({
            matches: [
              {
                id: '9ff41440-0d63-428e-ad12-039d0c244ca8',
                member_code: 'CM-1001',
                first_name: 'Ada',
                last_name: 'Okafor',
                lifecycle_stage: 'MEMBER',
                shared_phone: true,
              },
            ],
          })
        }
        return jsonResponse({}, 404)
      })
    )
    const screen = await renderWithShell(<DeskPage />)
    const submitButton = screen.getByRole('button', {
      name: /register person/i,
    })
    await expect.element(submitButton).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/first name/i), 'Bola')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Okafor')
    await userEvent.click(
      screen.getByRole('button', { name: /check for matches/i })
    )

    await expect.element(screen.getByText(/Ada Okafor/)).toBeVisible()
    await expect.element(screen.getByText(/Shares phone number/)).toBeVisible()
  })

  it('supports shortcode fallback on mobile layout and never reports offline errors as success', async () => {
    await page.viewport(390, 844)
    const serviceId = '9ff41440-0d63-428e-ad12-039d0c244ca8'
    let failNetwork = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/v1/services') && !url.includes('/check-ins')) {
          return jsonResponse({
            services: [
              {
                id: serviceId,
                name: 'Sunday Service',
                category: 'SUNDAY_SERVICE',
                status: 'CHECKIN_OPEN',
                scheduled_start_at: '2026-10-25T08:00:00Z',
                checkin_opens_at: '2026-10-25T07:00:00Z',
                checkin_closes_at: '2026-10-25T11:00:00Z',
              },
            ],
          })
        }
        if (failNetwork) throw new Error('Network unreachable')
        return jsonResponse({
          outcome: 'CHECKED_IN',
          person: { full_name: 'Ada Okafor', member_code: 'CM-1001' },
        })
      })
    )

    const screen = await renderWithShell(<ScanPage />)
    const input = screen.getByLabelText(/shortcode fallback/i)
    await expect.element(input).toBeVisible()

    await userEvent.type(input, '9K4-M7X')
    await userEvent.click(screen.getByRole('button', { name: /^check in$/i }))
    await expect.element(screen.getByText('Checked in')).toBeVisible()
    await expect.element(screen.getByText(/Ada Okafor · CM-1001/)).toBeVisible()

    failNetwork = true
    await userEvent.type(input, '2BC-3DF')
    await userEvent.click(screen.getByRole('button', { name: /^check in$/i }))
    await expect.element(screen.getByText('Not checked in')).toBeVisible()
    await expect.element(screen.getByText(/Network unreachable/)).toBeVisible()
  })

  it('renders dashboard metrics and actionable access-denied states', async () => {
    const serviceId = '9ff41440-0d63-428e-ad12-039d0c244ca8'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/v1/services')) {
          return jsonResponse({
            services: [
              {
                id: serviceId,
                name: 'Youth Service',
                category: 'SUNDAY_SERVICE',
                status: 'CHECKIN_OPEN',
                scheduled_start_at: '2026-10-25T08:00:00Z',
                checkin_opens_at: '2026-10-25T07:00:00Z',
                checkin_closes_at: '2026-10-25T11:00:00Z',
              },
            ],
          })
        }
        return jsonResponse({
          summary: {
            id: serviceId,
            name: 'Youth Service',
            status: 'CHECKIN_OPEN',
            total: 42,
            members: 30,
            first_timers: 12,
            returning_visitors: 0,
            eligible: 50,
            turnoutPercent: 60,
          },
        })
      })
    )

    const screen = await renderWithShell(
      <>
        <DashboardPage />
        <QueryState
          loading={false}
          error={new ApiError('Action not permitted', 403)}
        />
      </>
    )
    await expect.element(screen.getByText('60%')).toBeVisible()
    await expect.element(screen.getByText('Access denied')).toBeVisible()
  })

  it('renders a downloadable card preview in the browser', async () => {
    const screen = await renderWithShell(
      <CardDownloads
        card={{
          memberCode: 'CM-1001',
          shortCode: '9K4-M7X',
          credential: `cma://v1/${'A'.repeat(22)}`,
        }}
      />
    )
    await expect
      .element(screen.getByAltText(/Attendance card for CM-1001/))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: /download png/i }))
      .toBeEnabled()
    await expect
      .element(screen.getByRole('button', { name: /download printable pdf/i }))
      .toBeEnabled()
  })
})
