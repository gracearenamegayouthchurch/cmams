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
import { CardDownloads, CardsPage } from './cards'
import { CatalogsPage } from './catalogs'
import { CellsPage } from './cells'
import { DashboardPage } from './dashboard'
import { DeskPage } from './desk'
import { DirectoryPage } from './directory'
import { LoginPage } from './login'
import { QueryState } from './query-state'
import { ScanPage } from './scan'
import { ServicesPage } from './services'
import { StaffPage } from './staff'

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
  const servicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/services',
    component: () => <div>Services screen</div>,
  })
  const scanRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/scan',
    component: () => <div>Scan screen</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      loginRoute,
      servicesRoute,
      scanRoute,
    ]),
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
  it('lets an Admin create a named cell group in a region', async () => {
    const sent: { path: string; body: string | null | undefined }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/v1/session')
          return jsonResponse({
            staff: {
              id: 'admin',
              role: 'ADMIN',
              full_name: 'Admin',
              email: 'admin@example.org',
            },
          })
        if (path === '/api/v1/cells' && init?.method === 'POST') {
          sent.push({ path, body: init.body as string })
          return jsonResponse(
            {
              cell: {
                id: '11111111-1111-4111-8111-111111111111',
                name: 'North Cell',
                meeting_location: 'Hall A',
                region: 'NDAR',
                is_active: true,
              },
            },
            201
          )
        }
        if (path === '/api/v1/cells') return jsonResponse({ cells: [] })
        if (path === '/api/v1/cell-leaders')
          return jsonResponse({ leaders: [] })
        return jsonResponse({ error: 'Unexpected request' }, 404)
      })
    )
    const screen = await renderWithShell(<CellsPage />)
    await userEvent.type(screen.getByLabelText('Cell name'), 'North Cell')
    await userEvent.type(
      screen.getByLabelText('Saturday meeting location'),
      'Hall A'
    )
    await userEvent.click(screen.getByLabelText('Region'))
    await userEvent.click(page.getByRole('option', { name: 'Ndar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create cell' }))
    await expect.element(screen.getByText('Cell created.')).toBeVisible()
    expect(JSON.parse(sent[0].body ?? '{}')).toEqual({
      name: 'North Cell',
      location: 'Hall A',
      region: 'NDAR',
    })
  })

  it('shows a cell leader only their cell members and Saturday attendance', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input)
        calls.push(path)
        if (path === '/api/v1/session')
          return jsonResponse({
            staff: {
              id: 'leader',
              role: 'CELL_LEADER',
              full_name: 'Leader',
              email: 'leader@example.org',
            },
          })
        if (path === '/api/v1/cells')
          return jsonResponse({
            cells: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                name: 'North Cell',
                meeting_location: 'Hall A',
                region: 'NDAR',
                is_active: true,
              },
            ],
          })
        if (path.endsWith('/members'))
          return jsonResponse({
            members: [
              {
                id: 'person',
                member_code: 'CM-1010',
                first_name: 'Ada',
                middle_name: null,
                last_name: 'Okafor',
                email: 'ada@example.org',
                phone_e164: '+2348000000000',
                compound_name: 'East',
                room: 'D4',
                birth_day: 6,
                birth_month: 5,
                birth_year: null,
                department_name: 'Choir',
              },
            ],
          })
        if (path.endsWith('/meetings')) return jsonResponse({ meetings: [] })
        return jsonResponse({ error: 'Unexpected request' }, 404)
      })
    )
    const screen = await renderWithShell(<CellsPage />)
    await expect.element(screen.getByText(/ada@example.org/)).toBeVisible()
    await expect
      .element(screen.getByText(/church-service attendance is not included/i))
      .toBeVisible()
    expect(
      calls.some(
        (path) =>
          path.startsWith('/api/v1/people') ||
          path.startsWith('/api/v1/services') ||
          path === '/api/v1/cell-leaders'
      )
    ).toBe(false)
    expect(
      screen.getByRole('button', { name: 'Create cell' }).query()
    ).toBeNull()
  })

  it('shows required registration details and an optional birth year', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/v1/catalogs')
          return jsonResponse({
            compounds: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                name: 'Main Compound',
                region: 'ACROSS',
              },
            ],
            departments: [],
            regions: [
              { code: 'ACROSS', label: 'Across' },
              { code: 'NDAR', label: 'Ndar' },
              { code: 'CHIKAM', label: 'Chikam' },
              { code: 'HOSTEL', label: 'Hostel' },
            ],
          })
        return jsonResponse({ services: [] })
      })
    )
    const screen = await renderWithShell(<DeskPage />)
    await expect.element(screen.getByLabelText('Email')).toBeVisible()
    await expect.element(screen.getByLabelText('Region')).toBeVisible()
    await expect
      .element(screen.getByText('Compound', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByLabelText('Birth month')).toBeVisible()
    await expect.element(screen.getByLabelText('Birth day')).toBeVisible()
    await expect
      .element(screen.getByLabelText('Birth year (optional)'))
      .toBeVisible()
  })

  it('shows compounds and cells grouped by region without an add-compound form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/v1/cells')
          return jsonResponse({
            cells: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                name: 'Ndar Region 1',
                meeting_location: 'Hall A',
                region: 'NDAR',
                is_active: true,
              },
              {
                id: '44444444-4444-4444-8444-444444444444',
                name: 'Across Region 1',
                meeting_location: 'Hall B',
                region: 'ACROSS',
                is_active: true,
              },
            ],
          })
        return jsonResponse({
          compounds: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              name: 'Army Barracks',
              region: 'NDAR',
              is_active: true,
              member_count: 2,
            },
            {
              id: '22222222-2222-4222-8222-222222222222',
              name: 'East Gate',
              region: 'ACROSS',
              is_active: true,
              member_count: 0,
            },
          ],
          departments: [{ id: 'dept', name: 'Choir' }],
          regions: [
            { code: 'ACROSS', label: 'Across' },
            { code: 'NDAR', label: 'Ndar' },
            { code: 'CHIKAM', label: 'Chikam' },
            { code: 'HOSTEL', label: 'Hostel' },
          ],
        })
      })
    )
    const screen = await renderWithShell(<CatalogsPage />)
    await expect.element(screen.getByText('Army Barracks')).toBeVisible()
    await expect.element(screen.getByText('2 members')).toBeVisible()
    await expect.element(screen.getByText('Ndar Region 1')).toBeVisible()
    await expect.element(screen.getByText('Cells by region')).toBeVisible()
    await expect
      .element(screen.getByText('No compounds saved under Chikam yet.'))
      .toBeVisible()
    await expect
      .element(screen.getByText('No cells under Chikam yet.'))
      .toBeVisible()
    expect(screen.getByLabelText('New compound name').query()).toBeNull()
    await expect
      .element(screen.getByLabelText('New department name'))
      .toBeVisible()
  })

  it('shows an administrator the temporary password once for a new staff account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST' && String(input) === '/api/v1/staff')
          return jsonResponse(
            {
              staff: {
                id: 'new',
                email: 'desk@church.invalid',
                role: 'REGISTRATION_DESK',
              },
              temporaryPassword: 'temporary-long-password-1234',
            },
            201
          )
        return jsonResponse({ staff: [] })
      })
    )
    const screen = await renderWithShell(<StaffPage />)
    await userEvent.type(screen.getByLabelText('Full name'), 'New Desk')
    await userEvent.type(screen.getByLabelText('Email'), 'desk@church.invalid')
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' })
    )
    await expect
      .element(screen.getByLabelText('Temporary password'))
      .toHaveValue('temporary-long-password-1234')
    await userEvent.click(
      screen.getByRole('button', { name: 'I saved it securely' })
    )
    expect(screen.getByLabelText('Temporary password').query()).toBeNull()
  })
  it('explains why a future service cannot open check-in yet', async () => {
    const opens = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const closes = new Date(opens.getTime() + 4 * 60 * 60 * 1000)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          services: [
            {
              id: '9ff41440-0d63-428e-ad12-039d0c244ca8',
              name: 'Sunday Service',
              status: 'SCHEDULED',
              category: 'SUNDAY_SERVICE',
              scheduled_start_at: opens.toISOString(),
              checkin_opens_at: opens.toISOString(),
              checkin_closes_at: closes.toISOString(),
              locked_eligible_member_count: null,
            },
          ],
        })
      )
    )
    const screen = await renderWithShell(<ServicesPage />)
    await expect
      .element(screen.getByRole('button', { name: 'Open check-in' }))
      .toBeDisabled()
    await expect.element(screen.getByText(/Check-in opens on/i)).toBeVisible()
  })
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
      'desk@example.com'
    )
    await userEvent.type(
      screen.getByLabelText(/^password$/i),
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

  it('toggles between new and existing members and checks an existing member in', async () => {
    const serviceId = '9ff41440-0d63-428e-ad12-039d0c244ca8'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.startsWith('/api/v1/catalogs'))
          return jsonResponse({ compounds: [], departments: [], regions: [] })
        if (url.startsWith('/api/v1/cells')) return jsonResponse({ cells: [] })
        if (url.startsWith('/api/v1/people?'))
          return jsonResponse({
            people: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                member_code: 'CM-1001',
                first_name: 'Ada',
                last_name: 'Okafor',
                phone: '+234***',
                lifecycle_stage: 'MEMBER',
                last_attended_at: '2026-10-18T08:00:00Z',
                attendance_count: 4,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 10,
            totalPages: 1,
          })
        if (url.includes('/manual-check-ins') && init?.method === 'POST')
          return jsonResponse({ outcome: 'CHECKED_IN' })
        if (url.startsWith('/api/v1/services'))
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
                locked_eligible_member_count: null,
              },
            ],
          })
        return jsonResponse({}, 404)
      })
    )
    const screen = await renderWithShell(<DeskPage />)
    await expect
      .element(screen.getByLabelText('New member'))
      .toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByLabelText('Existing member'))
    await userEvent.type(screen.getByLabelText('Search members by name, phone or code'), 'Ada')
    await expect.element(screen.getByText('CM-1001')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /Ada Okafor/ }))
    await expect.element(screen.getByText('Check-ins')).toBeVisible()
    await userEvent.type(
      screen.getByLabelText('Reason for manual check-in'),
      'No card'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }))
    await expect
      .element(screen.getByText('Ada Okafor — checked in.'))
      .toBeVisible()
  })

  it('looks up a shared phone at the registration desk without checking in on selection', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url.startsWith('/api/v1/people?'))
          return jsonResponse({
            people: [
              { id: 'ada', first_name: 'Ada', last_name: 'Okafor', member_code: 'CM-1001', phone: '+234803*****92', lifecycle_stage: 'MEMBER' },
              { id: 'bola', first_name: 'Bola', last_name: 'Okafor', member_code: 'CM-1002', phone: '+234803*****92', lifecycle_stage: 'MEMBER' },
            ],
          })
        if (url === '/api/v1/services') return jsonResponse({ services: [] })
        return jsonResponse({ compounds: [], departments: [], regions: [], cells: [] })
      })
    )
    const screen = await renderWithShell(<DeskPage />)
    await userEvent.click(screen.getByLabelText('Existing member'))
    await userEvent.type(screen.getByLabelText('Search members by name, phone or code'), '0803 123 4592')
    await expect.element(screen.getByText('CM-1001')).toBeVisible()
    await expect.element(screen.getByText('CM-1002')).toBeVisible()
    expect(calls.some((path) => path.includes('q=0803%20123%204592'))).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: /Ada Okafor/ }))
    expect(calls.some((path) => path.includes('/manual-check-ins'))).toBe(false)
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
                locked_eligible_member_count: null,
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
    const input = screen.getByLabelText(/card code/i)
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

  it('accepts a hardware wedge shortcode, serializes scans, and retries failed sends immediately', async () => {
    const serviceId = '9ff41440-0d63-428e-ad12-039d0c244ca8'
    let rejectFirst: (reason: Error) => void = () => {}
    let attempts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/api/v1/services'))
          return jsonResponse({
            services: [{ id: serviceId, status: 'CHECKIN_OPEN' }],
          })
        attempts++
        if (attempts === 1)
          return new Promise<Response>((_resolve, reject) => {
            rejectFirst = reject
          })
        return jsonResponse({
          outcome: 'CHECKED_IN',
          person: { full_name: 'Ada Okafor', member_code: 'CM-1001' },
        })
      })
    )
    const screen = await renderWithShell(<ScanPage />)
    await expect.element(screen.getByText('Ready to scan')).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Start camera' }))
      .toBeEnabled()
    vi.spyOn(performance, 'now').mockReturnValue(100)
    const wedge = () => {
      for (const key of '9K4-M7X')
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true })
        )
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      )
    }
    wedge()
    await expect.poll(() => attempts).toBe(1)
    wedge()
    expect(attempts).toBe(1)
    rejectFirst(new Error('Network unreachable'))
    await expect.element(screen.getByText('Not checked in')).toBeVisible()
    wedge()
    await expect.poll(() => attempts).toBe(2)
    await expect.element(screen.getByText('Checked in')).toBeVisible()
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
                locked_eligible_member_count: null,
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

  it('renders a downloadable card preview and issues cards by searching people', async () => {
    const personId = '9ff41440-0d63-428e-ad12-039d0c244ca8'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (
          url.includes(`/api/v1/people/${personId}/cards`) &&
          init?.method === 'POST'
        ) {
          return jsonResponse({
            card: {
              memberCode: 'CM-1002',
              shortCode: '4H7-P2W',
              credential: `cma://v1/${'B'.repeat(22)}`,
            },
          })
        }
        if (url.includes('/api/v1/people?q=')) {
          return jsonResponse({
            people: [
              {
                id: personId,
                member_code: 'CM-1002',
                first_name: 'Chidi',
                last_name: 'Nwosu',
                phone: '+2348030001111',
                lifecycle_stage: 'MEMBER',
              },
            ],
          })
        }
        if (url.includes('/api/v1/cards')) {
          return jsonResponse({ cards: [] })
        }
        return jsonResponse({}, 404)
      })
    )

    const screen = await renderWithShell(
      <>
        <CardDownloads
          card={{
            memberCode: 'CM-1001',
            shortCode: '9K4-M7X',
            credential: `cma://v1/${'A'.repeat(22)}`,
          }}
        />
        <CardsPage />
      </>
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

    await userEvent.type(screen.getByLabelText(/find person/i), 'Chidi')
    await expect.element(screen.getByText('Chidi Nwosu')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /^issue card$/i }))
    await expect
      .element(screen.getByAltText(/Attendance card for CM-1002/))
      .toBeVisible()
  })

  it('displays paginated members and opens individual attendance history when a member is selected', async () => {
    const personId = '9ff41440-0d63-428e-ad12-039d0c244ca8'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes(`/api/v1/people/${personId}/attendance`)) {
          return jsonResponse({
            person: {
              id: personId,
              member_code: 'CM-1001',
              first_name: 'Ada',
              last_name: 'Okafor',
              phone: '+2348031234567',
              lifecycle_stage: 'MEMBER',
              registered_at: '2026-09-01T08:00:00Z',
            },
            history: [
              {
                id: 'att-1',
                service_id: 'svc-1',
                service_name: 'Youth Sunday Celebration',
                service_category: 'SUNDAY_SERVICE',
                scheduled_start_at: '2026-10-25T08:00:00Z',
                checked_in_at: '2026-10-25T08:12:00Z',
                checkin_method: 'QR_CAMERA',
                snapshot_stage: 'MEMBER',
              },
            ],
          })
        }
        if (url.includes('/api/v1/people')) {
          return jsonResponse({
            people: [
              {
                id: personId,
                member_code: 'CM-1001',
                first_name: 'Ada',
                last_name: 'Okafor',
                phone: '+2348031234567',
                lifecycle_stage: 'MEMBER',
                registered_at: '2026-09-01T08:00:00Z',
                attendance_count: 1,
                last_attended_at: '2026-10-25T08:12:00Z',
              },
            ],
            total: 1,
            page: 1,
            pageSize: 15,
            totalPages: 1,
          })
        }
        return jsonResponse({}, 404)
      })
    )

    const screen = await renderWithShell(<DirectoryPage />)
    await expect.element(screen.getByText('Ada Okafor')).toBeVisible()
    await expect
      .element(screen.getByText(/Showing 1–1 of 1 person/i))
      .toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /view history/i }))
    await expect
      .element(screen.getByText('Youth Sunday Celebration'))
      .toBeVisible()
    await expect.element(screen.getByText('QR scan')).toBeVisible()
  })

  it('shows the real attendance count rather than the limited history length', async () => {
    const personId = '9ff41440-0d63-428e-ad12-039d0c244ca8'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/attendance'))
          return jsonResponse({
            person: {
              id: personId,
              member_code: 'CM-1001',
              first_name: 'Ada',
              last_name: 'Okafor',
              attendance_count: 124,
              lifecycle_stage: 'MEMBER',
            },
            history: [
              {
                id: 'att-1',
                service_name: 'Sunday',
                service_category: 'SUNDAY_SERVICE',
                scheduled_start_at: '2026-10-25T08:00:00Z',
                checked_in_at: '2026-10-25T08:12:00Z',
                checkin_method: 'QR_SCAN',
              },
            ],
          })
        return jsonResponse({
          people: [
            {
              id: personId,
              member_code: 'CM-1001',
              first_name: 'Ada',
              last_name: 'Okafor',
              lifecycle_stage: 'MEMBER',
              attendance_count: 124,
            },
          ],
          total: 1,
          page: 1,
          totalPages: 1,
        })
      })
    )
    const screen = await renderWithShell(<DirectoryPage />)
    await userEvent.click(screen.getByRole('button', { name: /view history/i }))
    await expect.element(screen.getByText('124', { exact: true })).toBeVisible()
  })

  it('sends one directory query for a burst of typing', async () => {
    const requests: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requests.push(String(input))
        return jsonResponse({ people: [], total: 0, page: 1, totalPages: 1 })
      })
    )
    const screen = await renderWithShell(<DirectoryPage />)
    await expect.element(screen.getByLabelText(/search by name/i)).toBeVisible()
    await userEvent.type(screen.getByLabelText(/search by name/i), 'Grace')
    await expect
      .poll(() => requests.filter((url) => url.includes('q=Grace')).length)
      .toBe(1)
    expect(
      requests.filter(
        (url) =>
          /[?&]q=/.test(url) && !url.includes('q=&') && !url.includes('q=Grace')
      ).length
    ).toBe(0)
  })

  it('does not leave an old card recipient actionable while a new name is being entered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/v1/people?q=Ada'))
          return jsonResponse({
            people: [
              {
                id: 'ada',
                member_code: 'CM-1001',
                first_name: 'Ada',
                last_name: 'Okafor',
                lifecycle_stage: 'MEMBER',
              },
            ],
          })
        if (url.includes('/api/v1/people?q=Bola'))
          return jsonResponse({
            people: [
              {
                id: 'bola',
                member_code: 'CM-1002',
                first_name: 'Bola',
                last_name: 'Okafor',
                lifecycle_stage: 'MEMBER',
              },
            ],
          })
        return jsonResponse({ people: [], cards: [] })
      })
    )
    const screen = await renderWithShell(<CardsPage />)
    const input = screen.getByLabelText('Find person')
    await userEvent.type(input, 'Ada')
    await expect.element(screen.getByText('Ada Okafor')).toBeVisible()
    await userEvent.clear(input)
    await userEvent.type(input, 'Bola')
    expect(screen.getByText('Ada Okafor').query()).toBeNull()
    await expect.element(screen.getByText('Bola Okafor')).toBeVisible()
  })
})
