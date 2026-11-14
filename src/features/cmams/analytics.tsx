import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Keyboard, QrCode, Search, UserPlus, Zap } from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Area, AreaChart } from '@/components/charts/area-chart'
import { ChartTooltip, type TooltipRow } from '@/components/charts/tooltip'
import { XAxis } from '@/components/charts/x-axis'
import { formatDateTime, formatServiceStatus, serviceStatusClass } from './format'
import { KpiSparklines, type KpiMetric } from './kpi-sparklines'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { regionLabel } from './regions'
import { ServicePicker } from './service-picker'
import {
  type AnalyticsEntryMethodsSummary,
  type AnalyticsReport,
  type CheckinMethodType,
  type Service,
} from './types'

const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function formatDay(iso: string, withYear = false) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

function formatLongDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function timeAgo(iso: string) {
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000)
  if (Math.abs(days) < 14) return relative.format(days, 'day')
  if (Math.abs(days) < 60) return relative.format(Math.round(days / 7), 'week')
  return relative.format(Math.round(days / 30), 'month')
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}

function Meter({ percent }: { percent: number }) {
  return (
    <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
      <div
        className='h-full rounded-full bg-sky-500 transition-[width] duration-500 dark:bg-sky-400'
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  )
}

type RankedRow = {
  id: string
  name: string
  detail?: string
  attendees: number
  members: number
  turnoutPercent: number
}

function RankedList({ rows }: { rows: RankedRow[] }) {
  return (
    <ul className='max-h-[26rem] divide-y overflow-y-auto'>
      {rows.map((row, index) => (
        <li key={row.id} className='flex items-center gap-4 py-3.5'>
          <span className='w-5 shrink-0 text-right text-xs font-medium text-muted-foreground tabular-nums'>
            {index + 1}
          </span>
          <div className='min-w-0 flex-1 space-y-2'>
            <div className='flex items-baseline justify-between gap-3'>
              <div className='min-w-0'>
                <p className='truncate text-sm font-medium'>{row.name}</p>
                {row.detail && (
                  <p className='truncate text-xs text-muted-foreground'>
                    {row.detail}
                  </p>
                )}
              </div>
              <div className='flex shrink-0 items-baseline gap-3 tabular-nums'>
                <span className='text-xs text-muted-foreground'>
                  {integer.format(row.attendees)} of{' '}
                  {integer.format(row.members)}
                </span>
                <span className='w-12 text-right text-sm font-semibold'>
                  {row.turnoutPercent}%
                </span>
              </div>
            </div>
            <Meter percent={row.turnoutPercent} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyNote({ title, text }: { title: string; text: string }) {
  return (
    <div className='rounded-lg border border-dashed px-4 py-8 text-center'>
      <p className='text-sm font-medium'>{title}</p>
      <p className='mt-1 text-xs text-muted-foreground'>{text}</p>
    </div>
  )
}

const METHOD_CONFIG: Record<
  CheckinMethodType,
  {
    icon: typeof QrCode
    stroke: string
    bgClass: string
    badgeClass: string
  }
> = {
  QR_SCAN: {
    icon: QrCode,
    stroke: '#0ea5e9',
    bgClass: 'bg-sky-500',
    badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  },
  SHORTCODE_ENTRY: {
    icon: Keyboard,
    stroke: '#6366f1',
    bgClass: 'bg-indigo-500',
    badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
  },
  MANUAL_SEARCH: {
    icon: Search,
    stroke: '#f59e0b',
    bgClass: 'bg-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  },
  VISITOR_DESK_REGISTRATION: {
    icon: UserPlus,
    stroke: '#10b981',
    bgClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  },
}

function EntryMethodBreakdownCard({
  entryMethods,
}: {
  entryMethods: AnalyticsEntryMethodsSummary
}) {
  const [hovered, setHovered] = useState<CheckinMethodType | null>(null)
  const total = entryMethods.total
  const radius = 64
  const circumference = 2 * Math.PI * radius

  let cumulativeOffset = 0
  const slices = entryMethods.methods.map((item) => {
    const fraction = total > 0 ? item.count / total : 0
    const dash = fraction * circumference
    const offset = cumulativeOffset
    cumulativeOffset += dash
    return {
      ...item,
      dash,
      offset,
    }
  })

  const hoveredItem = hovered
    ? entryMethods.methods.find((m) => m.method === hovered)
    : null
  const manualCount =
    entryMethods.methods.find((m) => m.method === 'MANUAL_SEARCH')?.count ?? 0

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-4'>
        <div className='space-y-1'>
          <CardTitle>Entry method breakdown</CardTitle>
          <CardDescription>
            Check-in channels across QR scans, card codes, manual lookups, and
            desk registrations.
          </CardDescription>
        </div>
        <Badge
          variant='outline'
          className='gap-1.5 border-sky-500/30 bg-sky-500/10 px-3 py-1 font-medium text-sky-700 dark:text-sky-300'
        >
          <Zap className='size-3.5' aria-hidden='true' />
          <span>{entryMethods.qrAdoptionPercent}% Fast-lane adoption</span>
        </Badge>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid items-center gap-6 lg:grid-cols-12'>
          <div className='flex flex-col items-center justify-center lg:col-span-5'>
            <div className='relative size-48 sm:size-52'>
              <svg
                viewBox='0 0 200 200'
                className='size-full'
                aria-label='Entry methods donut chart'
              >
                <circle
                  cx={100}
                  cy={100}
                  r={radius}
                  fill='none'
                  strokeWidth={18}
                  className='stroke-muted/40'
                />
                {total > 0 &&
                  slices
                    .filter((s) => s.count > 0)
                    .map((slice) => {
                      const isHovered = hovered === slice.method
                      const config = METHOD_CONFIG[slice.method]
                      return (
                        <circle
                          key={slice.method}
                          cx={100}
                          cy={100}
                          r={radius}
                          fill='none'
                          stroke={config.stroke}
                          strokeWidth={isHovered ? 22 : 18}
                          strokeDasharray={`${slice.dash} ${circumference - slice.dash}`}
                          strokeDashoffset={-slice.offset}
                          transform='rotate(-90 100 100)'
                          className='cursor-pointer transition-all duration-300'
                          style={{
                            opacity: hovered === null || isHovered ? 1 : 0.35,
                          }}
                          onMouseEnter={() => setHovered(slice.method)}
                          onMouseLeave={() => setHovered(null)}
                        />
                      )
                    })}
              </svg>
              <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center'>
                <span className='text-3xl font-bold tracking-tight tabular-nums sm:text-4xl'>
                  {hoveredItem
                    ? integer.format(hoveredItem.count)
                    : integer.format(total)}
                </span>
                <span className='mt-0.5 max-w-[136px] truncate text-xs font-medium text-muted-foreground'>
                  {hoveredItem
                    ? `${hoveredItem.label} (${hoveredItem.percent}%)`
                    : 'Total verified'}
                </span>
              </div>
            </div>
          </div>

          <div className='grid gap-2.5 sm:grid-cols-2 lg:col-span-7'>
            {entryMethods.methods.map((method) => {
              const config = METHOD_CONFIG[method.method]
              const Icon = config.icon
              const isHovered = hovered === method.method
              return (
                <div
                  key={method.method}
                  tabIndex={0}
                  className={cn(
                    'rounded-lg border p-3 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isHovered
                      ? 'border-primary/50 bg-muted/60'
                      : 'bg-card/50 hover:bg-muted/40'
                  )}
                  onMouseEnter={() => setHovered(method.method)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(method.method)}
                  onBlur={() => setHovered(null)}
                >
                  <div className='flex items-start justify-between gap-2.5'>
                    <div className='flex min-w-0 items-center gap-2.5'>
                      <div
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-lg border',
                          config.badgeClass
                        )}
                      >
                        <Icon className='size-4' aria-hidden='true' />
                      </div>
                      <div className='min-w-0'>
                        <p className='truncate text-sm font-medium'>
                          {method.label}
                        </p>
                        <p className='truncate text-xs text-muted-foreground'>
                          {method.description}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className='mt-3 flex items-baseline justify-between text-xs tabular-nums'>
                    <span className='text-muted-foreground'>
                      {integer.format(method.count)} check-ins
                    </span>
                    <span className='text-sm font-semibold'>
                      {method.percent}%
                    </span>
                  </div>
                  <div className='mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted'>
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-500',
                        config.bgClass
                      )}
                      style={{
                        width: `${Math.min(100, Math.max(0, method.percent))}%`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {(total === 0 ||
          (manualCount > 0 && entryMethods.qrAdoptionPercent < 80)) && (
          <p className='text-xs text-muted-foreground'>
            {total === 0
              ? 'Entry channel distribution will populate as worshippers check in.'
              : `${integer.format(manualCount)} manual lookups recorded. Issue or reprint QR cards for repeat manual check-ins to speed up arrival.`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function buildAnalyticsKpiSeries(data: AnalyticsReport) {
  const serviceTime = Date.parse(data.service.scheduled_start_at)
  const eligible = data.summary.eligible
  const currentRow = {
    date: new Date(data.service.scheduled_start_at),
    total: data.summary.total,
    members: data.summary.members,
    visitors: data.summary.first_timers + data.summary.returning_visitors,
    turnoutPercent: data.summary.turnoutPercent,
  }

  const priorRows = data.trend
    .filter(
      (point) =>
        point.id !== data.service.id && Date.parse(point.date) < serviceTime
    )
    .map((point) => ({
      date: new Date(point.date),
      total: point.total,
      members: point.members,
      visitors: point.firstTimers + point.returningVisitors,
      turnoutPercent:
        point.turnoutPercent ??
        (eligible > 0
          ? Math.min(100, Math.round((point.members * 1000) / eligible) / 10)
          : 0),
    }))

  const rows = [...priorRows, currentRow]
  if (rows.length === 1) {
    return [
      {
        date: new Date(currentRow.date.getTime() - 7 * 86_400_000),
        total: 0,
        members: 0,
        visitors: 0,
        turnoutPercent: 0,
      },
      currentRow,
    ]
  }
  return rows
}

export function AnalyticsPage() {
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })
  const [selected, setSelected] = useState('')
  const [absenteeQuery, setAbsenteeQuery] = useState('')
  const serviceId =
    selected ||
    services.data?.services.find((item) => item.status === 'CHECKIN_OPEN')
      ?.id ||
    services.data?.services[0]?.id ||
    ''
  const selectedService = services.data?.services.find(
    (item) => item.id === serviceId
  )
  const report = useQuery({
    queryKey: ['analytics', serviceId],
    queryFn: () =>
      api<AnalyticsReport>(
        `/api/v1/analytics?serviceId=${encodeURIComponent(serviceId)}`
      ),
    enabled: !!serviceId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const data = report.data
  const absenteeNeedle = absenteeQuery.trim().toLowerCase()
  const filteredAbsentees = (data?.absentees ?? []).filter((person) => {
    if (!absenteeNeedle) return true
    const fullName = `${person.first_name} ${person.last_name}`.toLowerCase()
    return (
      fullName.includes(absenteeNeedle) ||
      person.member_code.toLowerCase().includes(absenteeNeedle) ||
      (person.cell_name ?? '').toLowerCase().includes(absenteeNeedle)
    )
  })
  const trend = data?.trend ?? []
  const average = trend.length
    ? Math.round(trend.reduce((sum, p) => sum + p.total, 0) / trend.length)
    : 0
  const peak = trend.reduce((max, p) => Math.max(max, p.total), 0)
  const trendData = trend.map((point) => ({
    date: new Date(point.date),
    total: point.total,
    members: point.members,
  }))
  const kpiSeries = data ? buildAnalyticsKpiSeries(data) : []
  const kpiMetrics: KpiMetric[] = data
    ? [
        {
          label: 'Total attendance',
          color: 'var(--chart-1)',
          data: kpiSeries.map((point) => ({
            date: point.date,
            value: point.total,
          })),
        },
        {
          label: 'Members present',
          color: 'var(--chart-2)',
          data: kpiSeries.map((point) => ({
            date: point.date,
            value: point.members,
          })),
        },
        {
          label: 'Visitors',
          color: 'var(--chart-5)',
          data: kpiSeries.map((point) => ({
            date: point.date,
            value: point.visitors,
          })),
        },
        {
          label: 'Member turnout',
          color: 'var(--chart-4)',
          format: (value) => `${value}%`,
          data: kpiSeries.map((point) => ({
            date: point.date,
            value: point.turnoutPercent,
          })),
        },
      ]
    : []

  return (
    <ChurchPage
      title='Analytics'
      description='Attendance, turnout, and follow-up for each service.'
    >
      <QueryState
        loading={services.isPending}
        error={services.error}
        onRetry={() => void services.refetch()}
      />

      {services.data && !serviceId && (
        <QueryState
          loading={false}
          error={null}
          empty
          emptyTitle='No services scheduled'
          emptyDescription='Analytics appear once a service has been scheduled.'
        />
      )}

      {services.data && serviceId && (
        <div className='mb-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4 shadow-2xs'>
          <ServicePicker
            services={services.data.services}
            value={serviceId}
            onChange={setSelected}
          />
          {selectedService && (
            <div className='flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground'>
              <Badge
                variant='outline'
                className={serviceStatusClass(selectedService.status)}
              >
                {selectedService.status === 'CHECKIN_OPEN' && (
                  <span
                    className='mr-1.5 inline-block size-1.5 rounded-full bg-emerald-500'
                    aria-hidden='true'
                  />
                )}
                {formatServiceStatus(selectedService.status)}
              </Badge>
              <span>{formatDateTime(selectedService.scheduled_start_at)}</span>
            </div>
          )}
        </div>
      )}

      {serviceId && (
        <QueryState
          loading={report.isPending}
          error={report.error}
          onRetry={() => void report.refetch()}
        />
      )}

      {data && (
        <div className='space-y-6'>
          <KpiSparklines metrics={kpiMetrics} />

          <Card>
            <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-4'>
              <div className='space-y-1'>
                <CardTitle>Sunday attendance trend</CardTitle>
                <CardDescription>
                  Total check-ins over the last {trend.length || 12} closed
                  Sunday services.
                </CardDescription>
              </div>
              {trend.length > 0 && (
                <dl className='flex gap-6 text-right'>
                  <div>
                    <dt className='text-xs text-muted-foreground'>Average</dt>
                    <dd className='text-lg font-semibold tabular-nums'>
                      {integer.format(average)}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>Peak</dt>
                    <dd className='text-lg font-semibold tabular-nums'>
                      {integer.format(peak)}
                    </dd>
                  </div>
                </dl>
              )}
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <>
                  <div
                    role='img'
                    aria-label='Area chart of total attendance across recent closed Sunday services'
                  >
                    <AreaChart
                      data={trendData}
                      xDataKey='date'
                      aspectRatio='4 / 1'
                      margin={{ top: 12, right: 12, bottom: 28, left: 12 }}
                    >
                      <Area
                        dataKey='total'
                        fadeEdges
                        fill='var(--chart-1)'
                        fillOpacity={0.6}
                        gradientToOpacity={0}
                        strokeWidth={2}
                      />
                      <XAxis numTicks={6} />
                      <ChartTooltip
                        rows={(point): TooltipRow[] => [
                          {
                            color: 'var(--chart-1)',
                            label: 'Total',
                            value: integer.format(Number(point.total ?? 0)),
                          },
                          {
                            color: 'var(--chart-2)',
                            label: 'Members',
                            value: integer.format(Number(point.members ?? 0)),
                          },
                        ]}
                      />
                    </AreaChart>
                  </div>
                  <table className='sr-only'>
                    <caption>Sunday attendance by date</caption>
                    <thead>
                      <tr>
                        <th>Sunday</th>
                        <th>Total</th>
                        <th>Members</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((point) => (
                        <tr key={point.id}>
                          <td>{formatDay(point.date, true)}</td>
                          <td>{point.total}</td>
                          <td>{point.members}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <EmptyNote
                  title='No closed Sunday services yet'
                  text='The trend appears after the first Sunday service is closed.'
                />
              )}
            </CardContent>
          </Card>

          {data.entryMethods && (
            <EntryMethodBreakdownCard entryMethods={data.entryMethods} />
          )}

          <div className='grid gap-6 xl:grid-cols-2'>
            <Card>
              <CardHeader className='space-y-1'>
                <CardTitle>Attendance by cell</CardTitle>
                <CardDescription>
                  Turnout for this service by each person&apos;s cell.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {data.cells.length > 0 ? (
                  <RankedList
                    rows={data.cells.map((cell) => ({
                      id: cell.id,
                      name: cell.name,
                      detail: regionLabel(cell.region),
                      attendees: cell.attendees,
                      members: cell.members,
                      turnoutPercent: cell.turnoutPercent,
                    }))}
                  />
                ) : (
                  <EmptyNote
                    title='No active cells'
                    text='Create cells and assign members to see cell turnout.'
                  />
                )}
                {(data.unassigned.members > 0 ||
                  data.unassigned.attendees > 0) && (
                  <p className='rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground'>
                    {integer.format(data.unassigned.attendees)}{' '}
                    {data.unassigned.attendees === 1
                      ? 'attendee is'
                      : 'attendees are'}{' '}
                    not assigned to a cell ·{' '}
                    {integer.format(data.unassigned.members)} unassigned{' '}
                    {data.unassigned.members === 1 ? 'member' : 'members'}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='space-y-1'>
                <CardTitle>Attendance by Activity Group</CardTitle>
                <CardDescription>
                  Turnout for this service by department. Members can belong to
                  more than one group.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.departments.length > 0 ? (
                  <RankedList
                    rows={data.departments.map((department) => ({
                      id: department.id,
                      name: department.name,
                      attendees: department.attendees,
                      members: department.members,
                      turnoutPercent: department.turnoutPercent,
                    }))}
                  />
                ) : (
                  <EmptyNote
                    title='No active Activity Groups'
                    text='Add departments in Catalogs to see group turnout.'
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
              <div className='space-y-1'>
                <div className='flex flex-wrap items-center gap-2.5'>
                  <CardTitle>Absent members this week</CardTitle>
                  {data.absentees.length > 0 && (
                    <Badge variant='secondary' className='tabular-nums'>
                      {integer.format(data.absentees.length)} to follow up
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {data.latestSunday
                    ? `Active members who missed ${data.latestSunday.name} on ${formatLongDay(data.latestSunday.date)}.`
                    : 'Active members who missed the latest closed Sunday service.'}
                </CardDescription>
              </div>
              {data.absentees.length > 0 && (
                <div className='flex flex-wrap items-center gap-2'>
                  <div className='relative w-full sm:w-56'>
                    <Search
                      className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground'
                      aria-hidden='true'
                    />
                    <Input
                      aria-label='Filter absent members'
                      placeholder='Filter name, code, or cell'
                      value={absenteeQuery}
                      onChange={(event) => setAbsenteeQuery(event.target.value)}
                      className='h-8 pl-8 text-xs'
                    />
                  </div>
                  <Button variant='outline' size='sm' asChild>
                    <Link to='/reports'>Export in Reports</Link>
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {data.absentees.length > 0 ? (
                filteredAbsentees.length > 0 ? (
                  <div className='max-h-[28rem] overflow-y-auto rounded-lg border'>
                    <Table>
                      <TableHeader className='sticky top-0 z-10 bg-card'>
                        <TableRow>
                          <TableHead>Member</TableHead>
                          <TableHead>Cell</TableHead>
                          <TableHead className='text-right'>
                            Last attended
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAbsentees.map((person) => (
                          <TableRow key={person.id}>
                            <TableCell>
                              <div className='flex items-center gap-3'>
                                <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground'>
                                  {initials(person.first_name, person.last_name)}
                                </span>
                                <div className='min-w-0'>
                                  <p className='truncate font-medium'>
                                    {person.first_name} {person.last_name}
                                  </p>
                                  <p className='font-mono text-xs text-muted-foreground'>
                                    {person.member_code}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className='text-muted-foreground'>
                              {person.cell_name ?? '—'}
                            </TableCell>
                            <TableCell className='text-right text-muted-foreground tabular-nums'>
                              {person.last_attended_at ? (
                                <span
                                  title={formatDay(person.last_attended_at, true)}
                                >
                                  {timeAgo(person.last_attended_at)}
                                </span>
                              ) : (
                                'Never'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <EmptyNote
                    title='No matching absent members'
                    text='Try clearing or adjusting your filter.'
                  />
                )
              ) : (
                <EmptyNote
                  title={
                    data.latestSunday
                      ? 'Everyone was present'
                      : 'No closed Sunday service yet'
                  }
                  text={
                    data.latestSunday
                      ? 'No active members missed the latest Sunday service.'
                      : 'The absentee list appears after a Sunday service is closed.'
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </ChurchPage>
  )
}
