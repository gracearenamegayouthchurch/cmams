import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarDays, ScanLine } from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatDateTime,
  formatServiceStatus,
  serviceStatusClass,
} from './format'
import { KpiSparklines, type KpiMetric } from './kpi-sparklines'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { ServicePicker } from './service-picker'
import { type Service, type Summary } from './types'

type SeriesRow = {
  date: Date
  total: number
  members: number
  visitors: number
  turnoutPercent: number
}

function buildDashboardSeries(
  current: Summary,
  trend: Summary[] | undefined,
  fallbackIso?: string
): SeriesRow[] {
  const currentIso =
    current.scheduled_start_at ?? fallbackIso ?? new Date().toISOString()
  const currentRow: SeriesRow = {
    date: new Date(currentIso),
    total: Number(current.total ?? 0),
    members: Number(current.members ?? 0),
    visitors:
      Number(current.first_timers ?? 0) +
      Number(current.returning_visitors ?? 0),
    turnoutPercent: Number(current.turnoutPercent ?? 0),
  }

  const historical = (trend ?? [])
    .filter((item) => item.id !== current.id && item.scheduled_start_at)
    .map((item) => ({
      date: new Date(item.scheduled_start_at!),
      total: Number(item.total ?? 0),
      members: Number(item.members ?? 0),
      visitors:
        Number(item.first_timers ?? 0) + Number(item.returning_visitors ?? 0),
      turnoutPercent: Number(item.turnoutPercent ?? 0),
    }))

  const rows = [...historical, currentRow]
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

export function DashboardPage() {
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
  const summary = useQuery({
    queryKey: ['dashboard', serviceId],
    queryFn: () =>
      api<{ summary: Summary; trend?: Summary[] }>(
        `/api/v1/dashboard?serviceId=${serviceId}`
      ),
    enabled: !!serviceId,
    refetchInterval: () =>
      document.visibilityState === 'visible' ? 3000 : false,
  })
  const data = summary.data?.summary
  const visitors = data ? data.first_timers + data.returning_visitors : 0
  const regularOrOther = data
    ? Math.max(0, data.total - data.members - visitors)
    : 0

  const series = data
    ? buildDashboardSeries(
        data,
        summary.data?.trend,
        selectedService?.scheduled_start_at
      )
    : []

  const kpiMetrics: KpiMetric[] = data
    ? [
        {
          label: 'Total checked in',
          color: 'var(--chart-1)',
          data: series.map((point) => ({
            date: point.date,
            value: point.total,
          })),
        },
        {
          label: 'Members present',
          color: 'var(--chart-2)',
          data: series.map((point) => ({
            date: point.date,
            value: point.members,
          })),
        },
        {
          label: 'Visitors',
          color: 'var(--chart-5)',
          data: series.map((point) => ({
            date: point.date,
            value: point.visitors,
          })),
        },
        {
          label: 'Member turnout',
          color: 'var(--chart-4)',
          format: (value) => `${value}%`,
          data: series.map((point) => ({
            date: point.date,
            value: point.turnoutPercent,
          })),
        },
      ]
    : []

  const breakdown = data
    ? [
        { label: 'Members', count: data.members, color: 'bg-sky-500' },
        {
          label: 'First-timers',
          count: data.first_timers,
          color: 'bg-emerald-500',
        },
        {
          label: 'Returning visitors',
          count: data.returning_visitors,
          color: 'bg-indigo-500',
        },
        ...(regularOrOther > 0
          ? [
              {
                label: 'Regular attendees',
                count: regularOrOther,
                color: 'bg-slate-400',
              },
            ]
          : []),
      ]
    : []

  return (
    <ChurchPage
      title='Dashboard'
      description='Live service attendance and member turnout.'
      actions={
        <>
          <Button variant='outline' size='sm' asChild>
            <Link to='/services'>
              <CalendarDays className='size-4' />
              Services
            </Link>
          </Button>
          <Button size='sm' asChild>
            <Link to='/scan'>
              <ScanLine className='size-4' />
              Open scanner
            </Link>
          </Button>
        </>
      }
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
              emptyDescription='Create a service on the Services page to start tracking check-ins.'
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
                      {selectedService.status === 'CHECKIN_OPEN' && (
                        <span
                          className='mr-1.5 inline-block size-1.5 rounded-full bg-emerald-500'
                          aria-hidden='true'
                        />
                      )}
                      {formatServiceStatus(selectedService.status)}
                    </Badge>
                    <span>
                      {formatDateTime(selectedService.scheduled_start_at)}
                    </span>
                    {selectedService.status === 'CHECKIN_OPEN' && (
                      <span className='text-sky-700 dark:text-sky-300'>
                        · Auto-updating
                      </span>
                    )}
                  </div>
                )}
              </div>

              <QueryState
                loading={summary.isPending}
                error={summary.error}
                onRetry={() => void summary.refetch()}
              />

              {data && (
                <>
                  <KpiSparklines metrics={kpiMetrics} />

                  <Card>
                    <CardHeader className='pb-3'>
                      <CardTitle className='text-base font-semibold'>
                        Attendance breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                      {breakdown.map((row) => {
                        const pct =
                          data.total > 0
                            ? Math.round((row.count / data.total) * 100)
                            : 0
                        return (
                          <div key={row.label} className='space-y-1.5'>
                            <div className='flex items-center justify-between text-sm'>
                              <span className='font-medium'>{row.label}</span>
                              <span className='text-muted-foreground tabular-nums'>
                                {row.count} ({pct}%)
                              </span>
                            </div>
                            <div className='h-2 w-full overflow-hidden rounded-full bg-muted'>
                              <div
                                className={`h-full rounded-full ${row.color} transition-all duration-300`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                      <p className='pt-1 text-xs text-muted-foreground'>
                        Turnout compares members checked in against active
                        members registered before check-in opened (
                        {data.eligible}).
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      )}
    </ChurchPage>
  )
}
