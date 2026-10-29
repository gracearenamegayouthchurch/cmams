import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  CalendarDays,
  Percent,
  UserMinus,
  UserRoundPlus,
  Users,
} from 'lucide-react'
import { api } from '@/lib/cmams-api'
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
import { Bar } from '@/components/charts/bar'
import { BarChart } from '@/components/charts/bar-chart'
import { BarYAxis } from '@/components/charts/bar-y-axis'
import { ChartTooltip, type TooltipRow } from '@/components/charts/tooltip'
import { XAxis } from '@/components/charts/x-axis'
import {
  formatDateTime,
  formatServiceStatus,
  serviceStatusClass,
} from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { regionLabel } from './regions'
import { ServicePicker } from './service-picker'
import { type AnalyticsReport, type Service } from './types'

const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

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
    year: 'numeric',
  })
}

function horizontalAspectRatio(count: number) {
  return `${Math.max(1.6, 3.2 - Math.min(count, 14) * 0.1)} / 1`
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  title: string
  value: string
  detail: string
  icon: typeof Activity
  accent: string
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {title}
        </CardTitle>
        <span
          className={`flex size-8 items-center justify-center rounded-lg ${accent}`}
        >
          <Icon className='size-4' aria-hidden='true' />
        </span>
      </CardHeader>
      <CardContent>
        <p className='text-3xl font-semibold tabular-nums'>{value}</p>
        <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
      </CardContent>
    </Card>
  )
}

function BreakdownTable({
  rows,
  firstColumn,
  firstColumnLabel,
  emptyLabel,
}: {
  rows: {
    id: string
    name: string
    detail?: string
    attendees: number
    members: number
    turnoutPercent: number
  }[]
  firstColumn: string
  firstColumnLabel: string
  emptyLabel: string
}) {
  if (rows.length === 0)
    return (
      <p className='rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground'>
        {emptyLabel}
      </p>
    )
  return (
    <div className='overflow-x-auto rounded-xl border'>
      <Table>
        <TableHeader>
          <TableRow className='bg-muted/40'>
            <TableHead>{firstColumnLabel}</TableHead>
            {firstColumn === 'region' && <TableHead>Region</TableHead>}
            <TableHead className='text-right'>Attendees</TableHead>
            <TableHead className='text-right'>Members</TableHead>
            <TableHead className='text-right'>Turnout</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className='font-medium'>{row.name}</TableCell>
              {firstColumn === 'region' && (
                <TableCell className='text-muted-foreground'>
                  {row.detail}
                </TableCell>
              )}
              <TableCell className='text-right tabular-nums'>
                {integer.format(row.attendees)}
              </TableCell>
              <TableCell className='text-right text-muted-foreground tabular-nums'>
                {integer.format(row.members)}
              </TableCell>
              <TableCell className='text-right tabular-nums'>
                {row.turnoutPercent}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
  const visitors = data
    ? data.summary.first_timers + data.summary.returning_visitors
    : 0
  const trendData =
    data?.trend.map((point) => ({
      date: new Date(point.date),
      total: point.total,
      members: point.members,
    })) ?? []
  const cellData =
    data?.cells.map((cell) => ({
      name: cell.name,
      attendees: cell.attendees,
      members: cell.members,
      turnout: cell.turnoutPercent,
    })) ?? []
  const departmentData =
    data?.departments.map((department) => ({
      name: department.name,
      attendees: department.attendees,
      members: department.members,
      turnout: department.turnoutPercent,
    })) ?? []

  return (
    <ChurchPage
      title='Analytics'
      description='Attendance trends, cell turnout, and Activity Group engagement for every service.'
    >
      <QueryState
        loading={services.isPending}
        error={services.error}
        onRetry={() => void services.refetch()}
      />

      {services.data && (
        <div className='space-y-6'>
          {!serviceId ? (
            <QueryState
              loading={false}
              error={null}
              empty
              emptyTitle='No services scheduled'
              emptyDescription='Analytics become available once a service has been scheduled.'
            />
          ) : (
            <>
              <div className='flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4 shadow-2xs'>
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
                      {formatServiceStatus(selectedService.status)}
                    </Badge>
                    <span>
                      {formatDateTime(selectedService.scheduled_start_at)}
                    </span>
                  </div>
                )}
              </div>

              <QueryState
                loading={report.isPending}
                error={report.error}
                onRetry={() => void report.refetch()}
              />

              {data && (
                <>
                  <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                    <MetricCard
                      title='Total checked in'
                      value={integer.format(data.summary.total)}
                      detail='All recorded arrivals'
                      icon={Activity}
                      accent='bg-sky-500/10 text-sky-600 dark:text-sky-400'
                    />
                    <MetricCard
                      title='Members present'
                      value={integer.format(data.summary.members)}
                      detail={`${integer.format(data.summary.eligible)} eligible members`}
                      icon={Users}
                      accent='bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    />
                    <MetricCard
                      title='Visitors'
                      value={integer.format(visitors)}
                      detail='First-timers and returning visitors'
                      icon={UserRoundPlus}
                      accent='bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    />
                    <MetricCard
                      title='Member turnout'
                      value={`${data.summary.turnoutPercent}%`}
                      detail={`${integer.format(data.summary.members)} of ${integer.format(data.summary.eligible)} members`}
                      icon={Percent}
                      accent='bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    />
                  </div>

                  <Card>
                    <CardHeader>
                      <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div>
                          <CardTitle>Sunday attendance trend</CardTitle>
                          <CardDescription className='mt-1'>
                            Total check-ins across the last 12 closed Sunday
                            services.
                          </CardDescription>
                        </div>
                        <Badge variant='secondary' className='tabular-nums'>
                          {data.trend.length}{' '}
                          {data.trend.length === 1 ? 'Sunday' : 'Sundays'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                      {trendData.length > 0 ? (
                        <>
                          <div
                            role='img'
                            aria-label='Area chart of total attendance across the last 12 closed Sunday services'
                          >
                            <AreaChart
                              data={trendData}
                              xDataKey='date'
                              aspectRatio='3.5 / 1'
                              margin={{
                                top: 16,
                                right: 16,
                                bottom: 32,
                                left: 16,
                              }}
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
                                    label: 'Total attendance',
                                    value: integer.format(
                                      Number(point.total ?? 0)
                                    ),
                                  },
                                  {
                                    color: 'var(--chart-2)',
                                    label: 'Members',
                                    value: integer.format(
                                      Number(point.members ?? 0)
                                    ),
                                  },
                                ]}
                              />
                            </AreaChart>
                          </div>
                          <div className='overflow-x-auto rounded-xl border'>
                            <Table>
                              <TableHeader>
                                <TableRow className='bg-muted/40'>
                                  <TableHead>Sunday</TableHead>
                                  <TableHead className='text-right'>
                                    Total
                                  </TableHead>
                                  <TableHead className='text-right'>
                                    Members
                                  </TableHead>
                                  <TableHead className='text-right'>
                                    Visitors
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {data.trend.map((point) => (
                                  <TableRow key={point.id}>
                                    <TableCell className='font-medium'>
                                      {formatDay(point.date, true)}
                                    </TableCell>
                                    <TableCell className='text-right tabular-nums'>
                                      {integer.format(point.total)}
                                    </TableCell>
                                    <TableCell className='text-right text-muted-foreground tabular-nums'>
                                      {integer.format(point.members)}
                                    </TableCell>
                                    <TableCell className='text-right text-muted-foreground tabular-nums'>
                                      {integer.format(
                                        Math.max(0, point.total - point.members)
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      ) : (
                        <QueryState
                          loading={false}
                          error={null}
                          empty
                          emptyTitle='No closed Sunday services yet'
                          emptyDescription='Close a Sunday service to start building the attendance trend.'
                        />
                      )}
                    </CardContent>
                  </Card>

                  <div className='grid gap-6 xl:grid-cols-2'>
                    <Card>
                      <CardHeader>
                        <div className='flex flex-wrap items-start justify-between gap-3'>
                          <div>
                            <CardTitle>Attendance by cell</CardTitle>
                            <CardDescription className='mt-1'>
                              Check-ins for this service grouped by each
                              person&apos;s current cell.
                            </CardDescription>
                          </div>
                          <Badge variant='secondary' className='tabular-nums'>
                            {data.cells.length}{' '}
                            {data.cells.length === 1 ? 'cell' : 'cells'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className='space-y-4'>
                        {cellData.length > 0 ? (
                          <>
                            <div
                              role='img'
                              aria-label={`Bar chart of attendance by cell for ${data.service.name}`}
                            >
                              <BarChart
                                data={cellData}
                                xDataKey='name'
                                orientation='horizontal'
                                aspectRatio={horizontalAspectRatio(
                                  cellData.length
                                )}
                                margin={{
                                  top: 8,
                                  right: 16,
                                  bottom: 16,
                                  left: 112,
                                }}
                              >
                                <Bar
                                  dataKey='attendees'
                                  fill='var(--chart-1)'
                                  stroke='var(--chart-1)'
                                  lineCap='round'
                                />
                                <BarYAxis maxWidth={100} />
                                <ChartTooltip
                                  showCrosshair={false}
                                  rows={(point): TooltipRow[] => [
                                    {
                                      color: 'var(--chart-1)',
                                      label: 'Attendees',
                                      value: integer.format(
                                        Number(point.attendees ?? 0)
                                      ),
                                    },
                                    {
                                      color: 'var(--chart-2)',
                                      label: 'Cell members',
                                      value: integer.format(
                                        Number(point.members ?? 0)
                                      ),
                                    },
                                    {
                                      color: 'var(--muted-foreground)',
                                      label: 'Turnout',
                                      value: `${Number(point.turnout ?? 0)}%`,
                                    },
                                  ]}
                                />
                              </BarChart>
                            </div>
                            <BreakdownTable
                              firstColumn='region'
                              firstColumnLabel='Cell'
                              emptyLabel='No active cells yet.'
                              rows={data.cells.map((cell) => ({
                                id: cell.id,
                                name: cell.name,
                                detail: regionLabel(cell.region),
                                attendees: cell.attendees,
                                members: cell.members,
                                turnoutPercent: cell.turnoutPercent,
                              }))}
                            />
                            {(data.unassigned.members > 0 ||
                              data.unassigned.attendees > 0) && (
                              <p className='text-xs text-muted-foreground'>
                                {integer.format(data.unassigned.attendees)}{' '}
                                {data.unassigned.attendees === 1
                                  ? 'attendee is'
                                  : 'attendees are'}{' '}
                                not assigned to a cell (
                                {integer.format(data.unassigned.members)} active{' '}
                                {data.unassigned.members === 1
                                  ? 'member'
                                  : 'members'}
                                ).
                              </p>
                            )}
                          </>
                        ) : (
                          <QueryState
                            loading={false}
                            error={null}
                            empty
                            emptyTitle='No active cells yet'
                            emptyDescription='Create cells and assign members to see cell-level attendance.'
                          />
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <div className='flex flex-wrap items-start justify-between gap-3'>
                          <div>
                            <CardTitle>Attendance by Activity Group</CardTitle>
                            <CardDescription className='mt-1'>
                              Check-ins for this service grouped by current
                              department.
                            </CardDescription>
                          </div>
                          <Badge variant='secondary' className='tabular-nums'>
                            {data.departments.length}{' '}
                            {data.departments.length === 1 ? 'group' : 'groups'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className='space-y-4'>
                        {departmentData.length > 0 ? (
                          <>
                            <div
                              role='img'
                              aria-label={`Bar chart of attendance by Activity Group for ${data.service.name}`}
                            >
                              <BarChart
                                data={departmentData}
                                xDataKey='name'
                                orientation='horizontal'
                                aspectRatio={horizontalAspectRatio(
                                  departmentData.length
                                )}
                                margin={{
                                  top: 8,
                                  right: 16,
                                  bottom: 16,
                                  left: 128,
                                }}
                              >
                                <Bar
                                  dataKey='attendees'
                                  fill='var(--chart-1)'
                                  stroke='var(--chart-1)'
                                  lineCap='round'
                                />
                                <BarYAxis maxWidth={116} />
                                <ChartTooltip
                                  showCrosshair={false}
                                  rows={(point): TooltipRow[] => [
                                    {
                                      color: 'var(--chart-1)',
                                      label: 'Attendees',
                                      value: integer.format(
                                        Number(point.attendees ?? 0)
                                      ),
                                    },
                                    {
                                      color: 'var(--chart-2)',
                                      label: 'Group members',
                                      value: integer.format(
                                        Number(point.members ?? 0)
                                      ),
                                    },
                                    {
                                      color: 'var(--muted-foreground)',
                                      label: 'Turnout',
                                      value: `${Number(point.turnout ?? 0)}%`,
                                    },
                                  ]}
                                />
                              </BarChart>
                            </div>
                            <BreakdownTable
                              firstColumn='name'
                              firstColumnLabel='Activity Group'
                              emptyLabel='No active Activity Groups yet.'
                              rows={data.departments.map((department) => ({
                                id: department.id,
                                name: department.name,
                                attendees: department.attendees,
                                members: department.members,
                                turnoutPercent: department.turnoutPercent,
                              }))}
                            />
                            <p className='text-xs text-muted-foreground'>
                              Members may serve in more than one Activity Group.
                            </p>
                          </>
                        ) : (
                          <QueryState
                            loading={false}
                            error={null}
                            empty
                            emptyTitle='No active Activity Groups yet'
                            emptyDescription='Add departments in Catalogs to see attendance by Activity Group.'
                          />
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div>
                          <div className='flex items-center gap-2.5'>
                            <CardTitle>Absent members this week</CardTitle>
                            <Badge variant='secondary' className='tabular-nums'>
                              {data.absentees.length}{' '}
                              {data.absentees.length === 1
                                ? 'member'
                                : 'members'}
                            </Badge>
                          </div>
                          <CardDescription className='mt-1'>
                            {data.latestSunday ? (
                              <>
                                Active members who did not attend{' '}
                                {data.latestSunday.name} on{' '}
                                {formatLongDay(data.latestSunday.date)}.
                              </>
                            ) : (
                              'Active members who missed the latest closed Sunday service.'
                            )}
                          </CardDescription>
                        </div>
                        <span className='flex size-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400'>
                          <UserMinus className='size-4' aria-hidden='true' />
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {data.absentees.length > 0 ? (
                        <div className='overflow-x-auto rounded-xl border'>
                          <Table>
                            <TableHeader>
                              <TableRow className='bg-muted/40'>
                                <TableHead className='w-32'>Code</TableHead>
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
                                  <TableCell className='font-mono text-xs font-medium text-muted-foreground'>
                                    {person.member_code}
                                  </TableCell>
                                  <TableCell className='font-medium'>
                                    {person.first_name} {person.last_name}
                                  </TableCell>
                                  <TableCell className='text-muted-foreground'>
                                    {person.cell_name ?? 'No cell'}
                                  </TableCell>
                                  <TableCell className='text-right text-muted-foreground tabular-nums'>
                                    {person.last_attended_at
                                      ? formatDay(person.last_attended_at, true)
                                      : 'No prior check-in'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <QueryState
                          loading={false}
                          error={null}
                          empty
                          emptyTitle={
                            data.latestSunday
                              ? 'Everyone was present'
                              : 'No closed Sunday service yet'
                          }
                          emptyDescription={
                            data.latestSunday
                              ? 'No active members are missing from the latest closed Sunday service.'
                              : 'Close a Sunday service to calculate the weekly absentee list.'
                          }
                        />
                      )}
                    </CardContent>
                  </Card>

                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <CalendarDays className='size-3.5' aria-hidden='true' />
                    <span>
                      Weekly absentees are based on the latest closed Sunday
                      service. Activity Groups use current department
                      assignments.
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </ChurchPage>
  )
}
