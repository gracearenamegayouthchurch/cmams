import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  CalendarDays,
  Percent,
  ScanLine,
  UserRoundPlus,
  Users,
} from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatDateTime,
  formatServiceStatus,
  serviceStatusClass,
} from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { ServicePicker } from './service-picker'
import { type Service, type Summary } from './types'

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
      api<{ summary: Summary }>(`/api/v1/dashboard?serviceId=${serviceId}`),
    enabled: !!serviceId,
    refetchInterval: () =>
      document.visibilityState === 'visible' ? 3000 : false,
  })
  const data = summary.data?.summary
  const visitors = data ? data.first_timers + data.returning_visitors : 0
  const regularOrOther = data
    ? Math.max(0, data.total - data.members - visitors)
    : 0

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
                  <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                    <Card>
                      <CardHeader className='flex flex-row items-center justify-between pb-2'>
                        <CardTitle className='text-sm font-medium text-muted-foreground'>
                          Total checked in
                        </CardTitle>
                        <span className='flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400'>
                          <Activity className='size-4' aria-hidden='true' />
                        </span>
                      </CardHeader>
                      <CardContent>
                        <p className='text-3xl font-semibold tabular-nums'>
                          {data.total}
                        </p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          All recorded arrivals
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className='flex flex-row items-center justify-between pb-2'>
                        <CardTitle className='text-sm font-medium text-muted-foreground'>
                          Members present
                        </CardTitle>
                        <span className='flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400'>
                          <Users className='size-4' aria-hidden='true' />
                        </span>
                      </CardHeader>
                      <CardContent>
                        <p className='text-3xl font-semibold tabular-nums'>
                          {data.members}
                        </p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Of {data.eligible} eligible members
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className='flex flex-row items-center justify-between pb-2'>
                        <CardTitle className='text-sm font-medium text-muted-foreground'>
                          Visitors
                        </CardTitle>
                        <span className='flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                          <UserRoundPlus
                            className='size-4'
                            aria-hidden='true'
                          />
                        </span>
                      </CardHeader>
                      <CardContent>
                        <p className='text-3xl font-semibold tabular-nums'>
                          {visitors}
                        </p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {data.first_timers} first-time ·{' '}
                          {data.returning_visitors} returning
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className='flex flex-row items-center justify-between pb-2'>
                        <CardTitle className='text-sm font-medium text-muted-foreground'>
                          Member turnout
                        </CardTitle>
                        <span className='flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400'>
                          <Percent className='size-4' aria-hidden='true' />
                        </span>
                      </CardHeader>
                      <CardContent>
                        <p className='text-3xl font-semibold tabular-nums'>
                          {data.turnoutPercent}%
                        </p>
                        <div
                          aria-hidden='true'
                          className='mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted'
                        >
                          <div
                            className='h-full rounded-full bg-sky-500 transition-all duration-300'
                            style={{
                              width: `${Math.min(100, Math.max(0, data.turnoutPercent))}%`,
                            }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

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
