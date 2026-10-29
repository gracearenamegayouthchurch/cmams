import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { formatServiceStatus, serviceStatusClass } from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { regionLabel } from './regions'
import { ServicePicker } from './service-picker'
import { type AnalyticsReport, type Service } from './types'

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

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null)
    return <span className='text-xs text-muted-foreground'>{label}</span>
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  return (
    <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular-nums',
          value > 0 &&
            'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
          value < 0 && 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
          value === 0 && 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className='size-3' aria-hidden='true' />
        {value > 0 ? '+' : ''}
        {integer.format(value)}
      </span>
      {label}
    </span>
  )
}

function Stat({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children: React.ReactNode
}) {
  return (
    <div className='space-y-2 p-5'>
      <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {label}
      </p>
      <p className='text-3xl font-semibold tracking-tight tabular-nums'>
        {value}
      </p>
      <div className='min-h-5'>{children}</div>
    </div>
  )
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

export function AnalyticsPage() {
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })
  const [selected, setSelected] = useState('')
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
  const trend = data?.trend ?? []
  const trendIndex = trend.findIndex((point) => point.id === data?.service.id)
  const previous = trendIndex > 0 ? trend[trendIndex - 1] : null
  const visitors = data
    ? data.summary.first_timers + data.summary.returning_visitors
    : 0
  const previousVisitors = previous
    ? previous.firstTimers + previous.returningVisitors
    : null
  const average = trend.length
    ? Math.round(trend.reduce((sum, p) => sum + p.total, 0) / trend.length)
    : 0
  const peak = trend.reduce((max, p) => Math.max(max, p.total), 0)
  const trendData = trend.map((point) => ({
    date: new Date(point.date),
    total: point.total,
    members: point.members,
  }))
  const compareLabel = previous
    ? `vs ${formatDay(previous.date)}`
    : 'No earlier Sunday'

  return (
    <ChurchPage
      title='Analytics'
      description='Attendance, turnout, and follow-up for each service.'
      actions={
        services.data &&
        serviceId && (
          <div className='flex flex-wrap items-end gap-3'>
            {selectedService && (
              <Badge
                variant='outline'
                className={cn(
                  'mb-2',
                  serviceStatusClass(selectedService.status)
                )}
              >
                {formatServiceStatus(selectedService.status)}
              </Badge>
            )}
            <ServicePicker
              services={services.data.services}
              value={serviceId}
              onChange={setSelected}
            />
          </div>
        )
      }
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

      {serviceId && (
        <QueryState
          loading={report.isPending}
          error={report.error}
          onRetry={() => void report.refetch()}
        />
      )}

      {data && (
        <div className='space-y-6'>
          <Card className='gap-0 overflow-hidden py-0'>
            <div className='grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4 [&>*]:bg-card'>
              <Stat
                label='Total attendance'
                value={integer.format(data.summary.total)}
              >
                <Delta
                  value={previous ? data.summary.total - previous.total : null}
                  label={compareLabel}
                />
              </Stat>
              <Stat
                label='Members present'
                value={integer.format(data.summary.members)}
              >
                <Delta
                  value={
                    previous ? data.summary.members - previous.members : null
                  }
                  label={compareLabel}
                />
              </Stat>
              <Stat label='Visitors' value={integer.format(visitors)}>
                <span className='text-xs text-muted-foreground'>
                  {integer.format(data.summary.first_timers)} first-time ·{' '}
                  {integer.format(data.summary.returning_visitors)} returning
                  {previousVisitors !== null && (
                    <span className='sr-only'>
                      {' '}
                      ({integer.format(visitors - previousVisitors)} change)
                    </span>
                  )}
                </span>
              </Stat>
              <Stat
                label='Member turnout'
                value={`${data.summary.turnoutPercent}%`}
              >
                <div className='space-y-1.5 pt-1'>
                  <Meter percent={data.summary.turnoutPercent} />
                  <p className='text-xs text-muted-foreground'>
                    {integer.format(data.summary.members)} of{' '}
                    {integer.format(data.summary.eligible)} eligible members
                  </p>
                </div>
              </Stat>
            </div>
          </Card>

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
                <CardTitle>Absent members this week</CardTitle>
                <CardDescription>
                  {data.latestSunday
                    ? `Active members who missed ${data.latestSunday.name} on ${formatLongDay(data.latestSunday.date)}.`
                    : 'Active members who missed the latest closed Sunday service.'}
                </CardDescription>
              </div>
              {data.absentees.length > 0 && (
                <Badge variant='secondary' className='tabular-nums'>
                  {integer.format(data.absentees.length)} to follow up
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {data.absentees.length > 0 ? (
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
                      {data.absentees.map((person) => (
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
