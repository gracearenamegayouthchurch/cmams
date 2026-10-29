import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Mail,
  MapPin,
  Phone,
  Search,
  Sparkles,
  UserCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatCategory,
  formatCheckinMethod,
  formatDateTime,
  formatStage,
  stageBadgeClass,
} from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { regionLabel } from './regions'
import {
  type FirstTimerPerson,
  type FirstTimersResponse,
  type Person,
  type PersonAttendanceRecord,
  type Service,
} from './types'
import { useDebouncedValue } from './use-debounced-value'

const statusFilters = [
  { value: 'all', label: 'All' },
  { value: 'first_timer', label: 'Awaiting 2nd visit' },
  { value: 'promoted', label: 'Promoted (2+ visits)' },
  { value: 'unassigned_cell', label: 'No cell assigned' },
] as const

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const pageSize = 15

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}

function fullName(person: FirstTimerPerson) {
  return [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')
}

function formatBirthday(
  month: number | null,
  day: number | null,
  year: number | null
) {
  if (!month || !day) return '—'
  const monthName = monthNames[month - 1] ?? ''
  return year ? `${monthName} ${day}, ${year}` : `${monthName} ${day}`
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function exportFirstTimersCsv(people: FirstTimerPerson[]) {
  const headers = [
    'Member Code',
    'Full Name',
    'Stage',
    'Phone',
    'Email',
    'Region',
    'Compound',
    'Room',
    'Birthday',
    'Cell Group',
    'Activity Groups',
    'First Service',
    'Services Attended',
    'Registered At',
  ]
  const escapeCsv = (val: unknown) => {
    const str = String(val ?? '')
    const safe = /^[\s]*[=+\-@]/.test(str) ? `'${str}` : str
    return `"${safe.replaceAll('"', '""')}"`
  }
  const rows = people.map((p) =>
    [
      p.member_code,
      fullName(p),
      formatStage(p.lifecycle_stage),
      p.phone ?? '',
      p.email ?? '',
      p.compound_region ? regionLabel(p.compound_region) : '',
      p.compound_name ?? '',
      p.room ?? '',
      formatBirthday(p.birth_month, p.birth_day, p.birth_year),
      p.cell_name ?? 'Unassigned',
      (p.departments ?? []).join('; '),
      p.first_service_name ?? '',
      p.attendance_count,
      p.registered_at,
    ]
      .map(escapeCsv)
      .join(',')
  )
  const csv = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `first-timers-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function FirstTimersPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [filter, setFilter] = useState<string>('all')
  const [serviceId, setServiceId] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [selectedPerson, setSelectedPerson] =
    useState<FirstTimerPerson | null>(null)

  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })

  const effectiveServiceId = serviceId === 'all' ? '' : serviceId

  const query = useQuery({
    queryKey: [
      'first-timers',
      debouncedSearch,
      filter,
      effectiveServiceId,
      page,
    ],
    queryFn: () =>
      api<FirstTimersResponse>(
        `/api/v1/first-timers?q=${encodeURIComponent(debouncedSearch)}&filter=${encodeURIComponent(filter)}&serviceId=${encodeURIComponent(effectiveServiceId)}&page=${page}&pageSize=${pageSize}`
      ),
  })

  const attendanceDetail = useQuery({
    queryKey: ['person-attendance', selectedPerson?.id],
    queryFn: () =>
      api<{ person: Person; history: PersonAttendanceRecord[] }>(
        `/api/v1/people/${selectedPerson?.id}/attendance`
      ),
    enabled: !!selectedPerson,
  })

  const summary = query.data?.summary
  const people = query.data?.people ?? []
  const total = query.data?.total ?? people.length
  const totalPages = query.data?.totalPages ?? 1
  const currentPage = query.data?.page ?? page
  const startRow = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endRow = Math.min(total, (currentPage - 1) * pageSize + people.length)
  const history = attendanceDetail.data?.history ?? []

  const retentionRate =
    summary && summary.totalTracked > 0
      ? Math.round((summary.promotedCount / summary.totalTracked) * 1000) / 10
      : 0

  return (
    <ChurchPage
      title='First-Timers'
      description='Track first-time visitors, residence and cell placement, and second-visit promotion to church membership.'
      actions={
        people.length > 0 ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => exportFirstTimersCsv(people)}
          >
            <Download className='size-4' />
            Export CSV
          </Button>
        ) : undefined
      }
    >
      <div className='space-y-6'>
        {summary && (
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            <div className='flex flex-col justify-between gap-2 rounded-xl border bg-card p-4'>
              <div className='flex items-center justify-between text-xs text-muted-foreground'>
                <span>Awaiting 2nd visit</span>
                <Sparkles
                  className='size-4 text-amber-500'
                  aria-hidden='true'
                />
              </div>
              <div className='flex items-baseline gap-2'>
                <span className='text-2xl font-semibold tracking-tight tabular-nums'>
                  {summary.activeFirstTimers}
                </span>
                <span className='text-xs text-muted-foreground tabular-nums'>
                  +{summary.newThisMonth} last 30d
                </span>
              </div>
              <p className='text-xs text-muted-foreground'>
                Need 1 more service check-in to become full members
              </p>
            </div>

            <div className='flex flex-col justify-between gap-2 rounded-xl border bg-card p-4'>
              <div className='flex items-center justify-between text-xs text-muted-foreground'>
                <span>Promoted to member</span>
                <UserCheck
                  className='size-4 text-emerald-500'
                  aria-hidden='true'
                />
              </div>
              <div className='flex items-baseline gap-2'>
                <span className='text-2xl font-semibold tracking-tight tabular-nums'>
                  {summary.promotedCount}
                </span>
                <span className='text-xs text-emerald-600 tabular-nums dark:text-emerald-400'>
                  2+ services
                </span>
              </div>
              <p className='text-xs text-muted-foreground'>
                Completed second check-in and promoted automatically
              </p>
            </div>

            <div className='flex flex-col justify-between gap-2 rounded-xl border bg-card p-4'>
              <div className='flex items-center justify-between text-xs text-muted-foreground'>
                <span>Retention rate</span>
                <span className='tabular-nums'>
                  {summary.promotedCount} of {summary.totalTracked}
                </span>
              </div>
              <div className='flex items-baseline gap-2'>
                <span className='text-2xl font-semibold tracking-tight tabular-nums'>
                  {retentionRate}%
                </span>
              </div>
              <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                <div
                  className='h-full rounded-full bg-emerald-500 transition-all duration-500'
                  style={{
                    width: `${Math.min(100, Math.max(0, retentionRate))}%`,
                  }}
                />
              </div>
            </div>

            <div className='flex flex-col justify-between gap-2 rounded-xl border bg-card p-4'>
              <div className='flex items-center justify-between text-xs text-muted-foreground'>
                <span>Unassigned to a cell</span>
                <UsersRound
                  className='size-4 text-sky-500'
                  aria-hidden='true'
                />
              </div>
              <div className='flex items-baseline justify-between gap-2'>
                <span className='text-2xl font-semibold tracking-tight tabular-nums'>
                  {summary.unassignedCellCount}
                </span>
                {summary.unassignedCellCount > 0 && (
                  <button
                    type='button'
                    onClick={() => {
                      setFilter('unassigned_cell')
                      setPage(1)
                    }}
                    className='text-xs font-medium text-sky-600 hover:underline dark:text-sky-400'
                  >
                    Filter unassigned
                  </button>
                )}
              </div>
              <p className='text-xs text-muted-foreground'>
                First-timers awaiting regional cell group placement
              </p>
            </div>
          </div>
        )}

        <div className='flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-2xs'>
          <div className='flex flex-wrap items-end justify-between gap-4'>
            <div className='w-full max-w-md space-y-1.5'>
              <Label htmlFor='first-timers-search'>
                Search by name, code, phone, email, or compound
              </Label>
              <div className='relative'>
                <Search
                  className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                  aria-hidden='true'
                />
                <Input
                  id='first-timers-search'
                  className='pr-9 pl-9'
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder='Name, CM-1001, phone, or compound...'
                />
                {search && (
                  <button
                    type='button'
                    onClick={() => {
                      setSearch('')
                      setPage(1)
                    }}
                    aria-label='Clear search'
                    className='absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground'
                  >
                    <X className='size-4' />
                  </button>
                )}
              </div>
            </div>

            <div className='w-full sm:w-64'>
              <Label htmlFor='first-timers-service' className='mb-1.5 block'>
                Captured in service
              </Label>
              <Select
                value={serviceId}
                onValueChange={(value) => {
                  setServiceId(value)
                  setPage(1)
                }}
              >
                <SelectTrigger id='first-timers-service' className='w-full'>
                  <SelectValue placeholder='All services' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All services</SelectItem>
                  {(services.data?.services ?? []).map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} ·{' '}
                      {formatShortDate(service.scheduled_start_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            role='group'
            aria-label='Filter first-timers'
            className='flex flex-wrap items-center gap-1.5'
          >
            {statusFilters.map((item) => {
              const active = filter === item.value
              return (
                <Button
                  key={item.value}
                  type='button'
                  size='sm'
                  variant={active ? 'default' : 'outline'}
                  onClick={() => {
                    setFilter(item.value)
                    setPage(1)
                  }}
                >
                  {item.label}
                </Button>
              )
            })}
          </div>
        </div>

        <QueryState
          loading={search !== debouncedSearch || query.isPending}
          error={query.error}
          empty={people.length === 0}
          emptyTitle={
            search.trim() || filter !== 'all' || effectiveServiceId
              ? 'No matching first-timers'
              : 'No first-timers recorded yet'
          }
          emptyDescription={
            search.trim() || filter !== 'all' || effectiveServiceId
              ? 'Adjust your search, status filter, or selected service.'
              : 'New visitors registered at the Registration desk will appear here with full residence and follow-up details.'
          }
          onRetry={() => void query.refetch()}
        />

        {search === debouncedSearch && query.data && people.length > 0 && (
          <Card className='overflow-hidden py-0'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>Person</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Residence</TableHead>
                  <TableHead>Cell &amp; Group</TableHead>
                  <TableHead>First Service</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className='text-right'>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => {
                  const isSelected = selectedPerson?.id === person.id
                  const visits = Math.max(0, Number(person.attendance_count ?? 0))
                  const promoted = person.lifecycle_stage !== 'FIRST_TIMER'
                  return (
                    <TableRow
                      key={person.id}
                      onClick={() => setSelectedPerson(person)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isSelected && 'bg-sky-50/70 dark:bg-sky-950/30'
                      )}
                    >
                      <TableCell>
                        <div className='flex items-center gap-3'>
                          <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground'>
                            {initials(person.first_name, person.last_name)}
                          </span>
                          <div className='min-w-0'>
                            <p className='truncate font-medium'>
                              {fullName(person)}
                            </p>
                            <p className='font-mono text-xs text-muted-foreground'>
                              {person.member_code}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className='space-y-0.5 text-xs'>
                          <p className='font-medium tabular-nums'>
                            {person.phone || '—'}
                          </p>
                          <p className='max-w-44 truncate text-muted-foreground'>
                            {person.email || 'No email'}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        {person.compound_name ? (
                          <div className='space-y-0.5 text-xs'>
                            <p className='font-medium'>
                              {person.compound_name}
                              {person.room ? ` · Rm ${person.room}` : ''}
                            </p>
                            {person.compound_region && (
                              <p className='text-muted-foreground'>
                                {regionLabel(person.compound_region)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className='text-xs text-muted-foreground'>
                            —
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className='space-y-1 text-xs'>
                          {person.cell_name ? (
                            <Badge variant='secondary' className='font-normal'>
                              {person.cell_name}
                            </Badge>
                          ) : (
                            <Badge
                              variant='outline'
                              className='border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                            >
                              Needs cell
                            </Badge>
                          )}
                          {person.departments?.length > 0 && (
                            <p className='truncate text-muted-foreground'>
                              {person.departments.join(', ')}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className='space-y-0.5 text-xs'>
                          <p className='font-medium'>
                            {person.first_service_name ?? 'Registered at desk'}
                          </p>
                          <p className='text-muted-foreground tabular-nums'>
                            {formatShortDate(
                              person.first_attended_at ?? person.registered_at
                            )}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className='space-y-1.5'>
                          <div className='flex items-center gap-2'>
                            <Badge
                              variant='outline'
                              className={stageBadgeClass(person.lifecycle_stage)}
                            >
                              {formatStage(person.lifecycle_stage)}
                            </Badge>
                            <span className='text-xs text-muted-foreground tabular-nums'>
                              {promoted
                                ? `${visits} visits`
                                : `${Math.min(2, visits)}/2 visits`}
                            </span>
                          </div>
                          {!promoted && (
                            <div className='h-1.5 w-24 overflow-hidden rounded-full bg-muted'>
                              <div
                                className='h-full rounded-full bg-amber-500 transition-all'
                                style={{
                                  width: `${Math.min(100, (visits / 2) * 100)}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className='text-right'>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedPerson(person)
                          }}
                        >
                          Details
                          <ChevronRight className='size-4' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className='flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground'>
              <span className='tabular-nums'>
                Showing {startRow}–{endRow} of {total}{' '}
                {total === 1 ? 'person' : 'people'}
              </span>
              <div className='flex items-center gap-2'>
                <span className='tabular-nums'>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={currentPage <= 1 || query.isFetching}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className='size-4' />
                  Previous
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={currentPage >= totalPages || query.isFetching}
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages, prev + 1))
                  }
                >
                  Next
                  <ChevronRight className='size-4' />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Sheet
        open={!!selectedPerson}
        onOpenChange={(open) => {
          if (!open) setSelectedPerson(null)
        }}
      >
        <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
          {selectedPerson && (
            <>
              <SheetHeader className='border-b pb-4'>
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-xs font-medium text-muted-foreground'>
                    {selectedPerson.member_code}
                  </span>
                  <Badge
                    variant='outline'
                    className={stageBadgeClass(selectedPerson.lifecycle_stage)}
                  >
                    {formatStage(selectedPerson.lifecycle_stage)}
                  </Badge>
                </div>
                <SheetTitle className='text-xl'>
                  {fullName(selectedPerson)}
                </SheetTitle>
                <SheetDescription>
                  Registered on {formatShortDate(selectedPerson.registered_at)}
                </SheetDescription>
              </SheetHeader>

              <div className='space-y-5 p-4'>
                <div className='rounded-xl border bg-muted/30 p-3.5'>
                  <div className='flex items-center justify-between text-xs font-medium'>
                    <span>Membership path (2 services required)</span>
                    <span className='tabular-nums'>
                      {Math.min(2, selectedPerson.attendance_count)} of 2
                      completed
                    </span>
                  </div>
                  <div className='mt-2.5 grid grid-cols-2 gap-2'>
                    <div
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-2.5 text-xs',
                        selectedPerson.attendance_count >= 1
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                          : 'bg-card text-muted-foreground'
                      )}
                    >
                      <CheckCircle2 className='size-4 shrink-0' />
                      <div>
                        <p className='font-medium'>1st Service</p>
                        <p className='text-[11px] opacity-80'>
                          {selectedPerson.first_attended_at
                            ? formatShortDate(selectedPerson.first_attended_at)
                            : 'Pending check-in'}
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-2.5 text-xs',
                        selectedPerson.attendance_count >= 2
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                          : 'bg-card text-muted-foreground'
                      )}
                    >
                      <CheckCircle2 className='size-4 shrink-0' />
                      <div>
                        <p className='font-medium'>2nd Service · Member</p>
                        <p className='text-[11px] opacity-80'>
                          {selectedPerson.attendance_count >= 2
                            ? 'Promoted to Member'
                            : 'Awaiting next visit'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className='grid grid-cols-2 gap-3'>
                  <div className='rounded-lg border bg-card p-3'>
                    <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                      <Phone className='size-3.5' aria-hidden='true' />
                      Phone
                    </div>
                    <p className='mt-1 text-sm font-semibold tabular-nums'>
                      {selectedPerson.phone || 'Not provided'}
                    </p>
                  </div>

                  <div className='rounded-lg border bg-card p-3'>
                    <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                      <Mail className='size-3.5' aria-hidden='true' />
                      Email
                    </div>
                    <p className='mt-1 truncate text-sm font-semibold'>
                      {selectedPerson.email || 'Not provided'}
                    </p>
                  </div>

                  <div className='rounded-lg border bg-card p-3'>
                    <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                      <MapPin className='size-3.5' aria-hidden='true' />
                      Compound &amp; Region
                    </div>
                    <p className='mt-1 text-sm font-semibold'>
                      {selectedPerson.compound_name || 'Not recorded'}
                      {selectedPerson.room
                        ? ` · Room ${selectedPerson.room}`
                        : ''}
                    </p>
                    {selectedPerson.compound_region && (
                      <p className='text-xs text-muted-foreground'>
                        {regionLabel(selectedPerson.compound_region)}
                      </p>
                    )}
                  </div>

                  <div className='rounded-lg border bg-card p-3'>
                    <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                      <Building2 className='size-3.5' aria-hidden='true' />
                      Cell &amp; Activity Group
                    </div>
                    <p className='mt-1 text-sm font-semibold'>
                      {selectedPerson.cell_name || 'Unassigned to cell'}
                    </p>
                    <p className='truncate text-xs text-muted-foreground'>
                      {selectedPerson.departments?.length
                        ? selectedPerson.departments.join(', ')
                        : 'No Activity Group'}
                    </p>
                  </div>
                </div>

                <div className='flex items-center justify-between rounded-lg border bg-muted/20 px-3.5 py-2.5 text-xs'>
                  <span className='text-muted-foreground'>Birthday</span>
                  <span className='font-medium'>
                    {formatBirthday(
                      selectedPerson.birth_month,
                      selectedPerson.birth_day,
                      selectedPerson.birth_year
                    )}
                  </span>
                </div>

                <div className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <h3 className='text-sm font-semibold'>
                      Attendance history
                    </h3>
                    <span className='text-xs text-muted-foreground tabular-nums'>
                      {selectedPerson.attendance_count}{' '}
                      {selectedPerson.attendance_count === 1
                        ? 'service'
                        : 'services'}
                    </span>
                  </div>

                  <QueryState
                    loading={attendanceDetail.isPending}
                    error={attendanceDetail.error}
                    empty={
                      !attendanceDetail.isPending &&
                      !attendanceDetail.error &&
                      history.length === 0
                    }
                    emptyTitle='No check-ins recorded'
                    emptyDescription='This person has not been checked into a service yet.'
                    onRetry={() => void attendanceDetail.refetch()}
                  />

                  {history.length > 0 && (
                    <div className='divide-y rounded-lg border'>
                      {history.map((record) => (
                        <div
                          key={record.id}
                          className='flex items-start justify-between gap-3 p-3 text-sm'
                        >
                          <div className='space-y-1'>
                            <p className='font-medium'>{record.service_name}</p>
                            <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                              <span>
                                {formatCategory(record.service_category)}
                              </span>
                              <span>·</span>
                              <span>
                                {formatCheckinMethod(record.checkin_method)}
                              </span>
                            </div>
                          </div>
                          <div className='text-right'>
                            <div className='flex items-center justify-end gap-1 text-xs text-muted-foreground tabular-nums'>
                              <Clock className='size-3' aria-hidden='true' />
                              {formatDateTime(record.checked_in_at)}
                            </div>
                            <Badge
                              variant='outline'
                              className={`mt-1 ${stageBadgeClass(record.snapshot_stage)}`}
                            >
                              {formatStage(record.snapshot_stage)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </ChurchPage>
  )
}
