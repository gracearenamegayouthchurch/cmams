import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CheckCircle2, Clock } from 'lucide-react'
import { api } from '@/lib/cmams-api'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  formatCategory,
  formatDateTime,
  formatServiceStatus,
  formatTimeRange,
  serviceStatusClass,
} from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { type Service } from './types'

function toLocalDatetimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function nextSundayPreset() {
  const now = new Date()
  const daysUntilSunday = (7 - now.getDay()) % 7
  const sunday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilSunday
  )
  const start = new Date(sunday)
  start.setHours(8, 0, 0, 0)
  if (start <= now) start.setDate(start.getDate() + 7)
  const open = new Date(start)
  open.setHours(7, 0, 0, 0)
  const close = new Date(start)
  close.setHours(11, 0, 0, 0)
  return {
    scheduled: toLocalDatetimeInput(start),
    opens: toLocalDatetimeInput(open),
    closes: toLocalDatetimeInput(close),
  }
}

function readableServiceError(message: string): string {
  if (message.includes('Invalid service transition')) {
    return 'Check-in can only be opened during the scheduled check-in window.'
  }
  return message
}

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
    onSuccess: async (_, variables) => {
      if (variables.path.endsWith('/open'))
        setMessage('Check-in is now open for this service.')
      else if (variables.path.endsWith('/close')) setMessage('Check-in closed.')
      else setMessage('Service scheduled.')
      await queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })

  function applySundayPreset() {
    const preset = nextSundayPreset()
    if (!name.trim()) setName('Sunday Service')
    setCategory('SUNDAY_SERVICE')
    setScheduled(preset.scheduled)
    setOpens(preset.opens)
    setCloses(preset.closes)
  }

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
      /* mutation.error displays the failure */
    }
  }

  return (
    <ChurchPage
      title='Services'
      description='Schedule services and open or close check-in windows.'
    >
      {message && (
        <div
          role='status'
          className='mb-6 flex items-center gap-2.5 rounded-xl border border-sky-500/35 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-100'
        >
          <CheckCircle2
            className='size-4 shrink-0 text-sky-600 dark:text-sky-400'
            aria-hidden='true'
          />
          <span>{message}</span>
        </div>
      )}
      {mutation.error && (
        <div
          role='alert'
          className='mb-6 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive'
        >
          {readableServiceError(mutation.error.message)}
        </div>
      )}

      <div className='grid gap-6 xl:grid-cols-[380px_1fr]'>
        <Card className='h-fit'>
          <CardHeader>
            <div className='flex items-start justify-between gap-2'>
              <div>
                <CardTitle>Schedule a service</CardTitle>
                <CardDescription className='mt-1'>
                  Set the start time and check-in window.
                </CardDescription>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={applySundayPreset}
              >
                Sunday 8 AM
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void create(event)}
              className='space-y-4'
            >
              <div className='space-y-1.5'>
                <Label htmlFor='service-name'>Service name</Label>
                <Input
                  id='service-name'
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder='Sunday Service'
                />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='service-category'>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id='service-category' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='SUNDAY_SERVICE'>
                      Sunday service
                    </SelectItem>
                    <SelectItem value='MIDWEEK_SERVICE'>
                      Midweek service
                    </SelectItem>
                    <SelectItem value='DEPARTMENT_MEETING'>
                      Department meeting
                    </SelectItem>
                    <SelectItem value='SPECIAL_EVENT'>Special event</SelectItem>
                    <SelectItem value='LEADERSHIP_MEETING'>
                      Leadership meeting
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(
                [
                  ['scheduled', scheduled, setScheduled, 'Service starts'],
                  ['opens', opens, setOpens, 'Check-in opens'],
                  ['closes', closes, setCloses, 'Check-in closes'],
                ] as const
              ).map(([id, value, setValue, label]) => (
                <div className='space-y-1.5' key={id}>
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
                <CalendarPlus className='size-4' />
                {mutation.isPending ? 'Saving…' : 'Schedule service'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-base font-semibold'>Scheduled & recent</h2>
            {services.data && (
              <Badge variant='secondary'>
                {services.data.services.length} total
              </Badge>
            )}
          </div>
          <QueryState
            loading={services.isPending}
            error={services.error}
            empty={services.data?.services.length === 0}
            emptyTitle='No services scheduled'
            emptyDescription='Use the form to schedule your next Sunday or midweek service.'
            onRetry={() => void services.refetch()}
          />
          {services.data?.services.map((service) => (
            <Card key={service.id}>
              <CardContent className='flex flex-wrap items-center justify-between gap-4 pt-6'>
                <div className='space-y-1.5'>
                  <div className='flex flex-wrap items-center gap-2.5'>
                    <h3 className='font-semibold'>{service.name}</h3>
                    <Badge
                      variant='outline'
                      className={serviceStatusClass(service.status)}
                    >
                      {formatServiceStatus(service.status)}
                    </Badge>
                  </div>
                  <p className='text-sm text-muted-foreground'>
                    {formatCategory(service.category)} ·{' '}
                    {formatDateTime(service.scheduled_start_at)}
                  </p>
                  <p className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                    <Clock className='size-3.5' aria-hidden='true' />
                    <span>
                      Check-in window:{' '}
                      {formatTimeRange(
                        service.checkin_opens_at,
                        service.checkin_closes_at
                      )}
                    </span>
                    {service.locked_eligible_member_count !== null && (
                      <span>
                        · {service.locked_eligible_member_count} eligible
                        members
                      </span>
                    )}
                  </p>
                </div>
                <div className='flex gap-2'>
                  {service.status === 'SCHEDULED' && (
                    <Button
                      size='sm'
                      disabled={mutation.isPending}
                      onClick={() => {
                        setMessage('')
                        void mutation
                          .mutateAsync({
                            path: `/api/v1/services/${service.id}/open`,
                            body: {},
                          })
                          .catch(() => {})
                      }}
                    >
                      Open check-in
                    </Button>
                  )}
                  {service.status === 'CHECKIN_OPEN' && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={mutation.isPending}
                      onClick={() => {
                        setMessage('')
                        void mutation
                          .mutateAsync({
                            path: `/api/v1/services/${service.id}/close`,
                            body: {},
                          })
                          .catch(() => {})
                      }}
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
    </ChurchPage>
  )
}
