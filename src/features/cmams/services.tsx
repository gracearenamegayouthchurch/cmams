import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { type Service } from './types'

export function ServicesPage() {
  const queryClient = useQueryClient()
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('SUNDAY_SERVICE')
  const [scheduled, setScheduled] = useState('')
  const [opens, setOpens] = useState('')
  const [closes, setCloses] = useState('')
  const mutation = useMutation({
    mutationFn: ({
      path,
      body,
    }: {
      path: string
      body: Record<string, string>
    }) => api(path, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: async () => {
      setMessage('Service updated.')
      await queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    try {
      await mutation.mutateAsync({
        path: '/api/v1/services',
        body: {
          name,
          category,
          scheduledStartAt: new Date(scheduled).toISOString(),
          opensAt: new Date(opens).toISOString(),
          closesAt: new Date(closes).toISOString(),
        },
      })
      setName('')
    } catch {
      /* mutation.error displays the actual API failure */
    }
  }
  return (
    <ChurchPage
      title='Services'
      description='Plan gatherings, open the desk, and close check-in when arrivals are complete.'
    >
      <div className='grid gap-6 xl:grid-cols-[360px_1fr]'>
        <Card className='h-fit'>
          <CardHeader>
            <CardTitle>Schedule a service</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void create(event)}
              className='space-y-4'
            >
              <div className='space-y-2'>
                <Label htmlFor='service-name'>Service name</Label>
                <Input
                  id='service-name'
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder='Sunday service'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='service-category'>Gathering type</Label>
                <select
                  id='service-category'
                  className='h-9 w-full rounded-md border bg-background px-3 text-sm'
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value='SUNDAY_SERVICE'>Sunday service</option>
                  <option value='MIDWEEK_SERVICE'>Midweek service</option>
                  <option value='DEPARTMENT_MEETING'>Department meeting</option>
                  <option value='SPECIAL_EVENT'>Special event</option>
                  <option value='LEADERSHIP_MEETING'>Leadership meeting</option>
                </select>
              </div>
              {(
                [
                  ['scheduled', scheduled, setScheduled, 'Starts at'],
                  ['opens', opens, setOpens, 'Check-in opens'],
                  ['closes', closes, setCloses, 'Check-in closes'],
                ] as const
              ).map(([id, value, setValue, label]) => (
                <div className='space-y-2' key={id}>
                  <Label htmlFor={id}>{label}</Label>
                  <Input
                    id={id}
                    type='datetime-local'
                    required
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  />
                </div>
              ))}
              <Button disabled={mutation.isPending} className='w-full'>
                Schedule service
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className='space-y-4'>
          <h2 className='text-xl font-semibold'>Gatherings</h2>
          <QueryState
            loading={services.isPending}
            error={services.error}
            empty={services.data?.services.length === 0}
            onRetry={() => void services.refetch()}
          />
          {services.data?.services.map((service) => (
            <Card key={service.id}>
              <CardContent className='flex flex-wrap items-center justify-between gap-4 pt-6'>
                <div>
                  <h3 className='font-semibold'>{service.name}</h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {new Date(service.scheduled_start_at).toLocaleString()} ·{' '}
                    {service.status.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className='flex gap-2'>
                  {service.status === 'SCHEDULED' && (
                    <Button
                      size='sm'
                      disabled={mutation.isPending}
                      onClick={() =>
                        void mutation
                          .mutateAsync({
                            path: `/api/v1/services/${service.id}/open`,
                            body: {},
                          })
                          .catch(() => {})
                      }
                    >
                      Open check-in
                    </Button>
                  )}
                  {service.status === 'CHECKIN_OPEN' && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={mutation.isPending}
                      onClick={() =>
                        void mutation
                          .mutateAsync({
                            path: `/api/v1/services/${service.id}/close`,
                            body: {},
                          })
                          .catch(() => {})
                      }
                    >
                      Close check-in
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      {message && (
        <p role='status' className='mt-4 text-sm text-sky-700'>
          {message}
        </p>
      )}
      {mutation.error && (
        <p role='alert' className='mt-4 text-sm text-destructive'>
          {mutation.error.message}
        </p>
      )}
    </ChurchPage>
  )
}
