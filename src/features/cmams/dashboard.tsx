import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, CalendarDays, Users, UserRoundPlus } from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { ServicePicker } from './service-picker'
import { type Service, type Summary } from './types'

const metricStyles = [Activity, Users, UserRoundPlus, CalendarDays]

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
  const summary = useQuery({
    queryKey: ['dashboard', serviceId],
    queryFn: () =>
      api<{ summary: Summary }>(`/api/v1/dashboard?serviceId=${serviceId}`),
    enabled: !!serviceId,
    refetchInterval: () =>
      document.visibilityState === 'visible' ? 3000 : false,
  })
  const data = summary.data?.summary
  const metrics = data
    ? [
        { label: 'Checked in', value: data.total },
        { label: 'Members present', value: data.members },
        { label: 'First-time visitors', value: data.first_timers },
        { label: 'Member turnout', value: `${data.turnoutPercent}%` },
      ]
    : []
  return (
    <ChurchPage
      title='Church overview'
      description='A clear picture of arrivals and member care, updated while this page is open.'
    >
      <QueryState
        loading={services.isPending}
        error={services.error}
        onRetry={() => void services.refetch()}
      />
      {services.data && (
        <div className='space-y-7'>
          <ServicePicker
            services={services.data.services}
            value={serviceId}
            onChange={setSelected}
          />
          {!serviceId ? (
            <p className='rounded-lg border border-dashed p-8 text-muted-foreground'>
              No services scheduled yet. Create one in Services to begin
              tracking attendance.
            </p>
          ) : (
            <>
              <QueryState
                loading={summary.isPending}
                error={summary.error}
                onRetry={() => void summary.refetch()}
              />
              {data && (
                <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                  {metrics.map((metric, index) => {
                    const Icon = metricStyles[index]
                    return (
                      <Card key={metric.label}>
                        <CardHeader className='flex flex-row items-center justify-between pb-2'>
                          <CardTitle className='text-sm font-medium text-muted-foreground'>
                            {metric.label}
                          </CardTitle>
                          <Icon
                            className='size-4 text-sky-600'
                            aria-hidden='true'
                          />
                        </CardHeader>
                        <CardContent>
                          <p className='text-3xl font-semibold tabular-nums'>
                            {metric.value}
                          </p>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
              {data && (
                <p className='text-sm text-muted-foreground'>
                  Eligible members for this service: {data.eligible}. This
                  figure is locked when check-in closes.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </ChurchPage>
  )
}
