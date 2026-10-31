import { useEffect, useState, type FormEvent } from 'react'
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
import { DateTimePicker } from '@/components/ui/datetime-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'
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
  return { scheduled: start, opens: open, closes: close }
}

function readableServiceError(message: string): string {
  if (message.includes('Invalid service transition')) {
    return 'This service is no longer scheduled or its status changed. Refresh the list and try again.'
  }
  return message
}

export function ServicesPage() {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('SUNDAY_SERVICE')
  const [scheduled, setScheduled] = useState<Date | undefined>()
  const [opens, setOpens] = useState<Date | undefined>()
  const [closes, setCloses] = useState<Date | undefined>()
  const [closeTarget, setCloseTarget] = useState<Service | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Service | null>(null)
  const [editingService, setEditingService] = useState<Service | null>(null)

  const mutation = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string
      body: Record<string, string>
      method?: 'POST' | 'PATCH'
    }) => api(path, { method, body: JSON.stringify(body) }),
    onSuccess: async (_, variables) => {
      if (variables.path.endsWith('/open'))
        setMessage('Check-in is now open for this service.')
      else if (variables.path.endsWith('/close')) setMessage('Check-in closed.')
      else if (variables.path.endsWith('/cancel'))
        setMessage('Service cancelled.')
      else if (variables.method === 'PATCH') setMessage('Service updated.')
      else setMessage('Service scheduled.')
      await queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
  const failedOpenId = mutation.variables?.path.match(
    /^\/api\/v1\/services\/([0-9a-f-]{36})\/open$/i
  )?.[1]
  const failedService = services.data?.services.find(
    (item) => item.id === failedOpenId
  )
  const openService = services.data?.services.find(
    (item) => item.status === 'CHECKIN_OPEN'
  )

  function applySundayPreset() {
    const preset = nextSundayPreset()
    if (!name.trim()) setName('Sunday Service')
    setCategory('SUNDAY_SERVICE')
    setScheduled(preset.scheduled)
    setOpens(preset.opens)
    setCloses(preset.closes)
    setFormError('')
  }

  function startEditing(service: Service) {
    setEditingService(service)
    setName(service.name)
    setCategory(service.category)
    setScheduled(new Date(service.scheduled_start_at))
    setOpens(new Date(service.checkin_opens_at))
    setCloses(new Date(service.checkin_closes_at))
    setFormError('')
    setMessage('')
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setFormError('')
    if (!scheduled || !opens || !closes) {
      setFormError('Choose the service start and both check-in times.')
      return
    }
    if (closes <= opens) {
      setFormError('Check-in must close after it opens.')
      return
    }
    try {
      await mutation.mutateAsync({
        path: editingService
          ? `/api/v1/services/${editingService.id}`
          : '/api/v1/services',
        method: editingService ? 'PATCH' : 'POST',
        body: {
          name,
          category,
          scheduledStartAt: scheduled.toISOString(),
          opensAt: opens.toISOString(),
          closesAt: closes.toISOString(),
        },
      })
      setName('')
      setEditingService(null)
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
          {readableServiceError(mutation.error.message)}{' '}
          {failedService &&
            mutation.error.message.includes('has not opened yet') &&
            `Check-in opens on ${formatDateTime(failedService.checkin_opens_at)}.`}
          {failedService &&
            mutation.error.message.includes('already ended') &&
            `The window ended on ${formatDateTime(failedService.checkin_closes_at)}. Schedule another service.`}
        </div>
      )}

      <div className='grid gap-6 xl:grid-cols-[380px_1fr]'>
        <Card className='h-fit'>
          <CardHeader>
            <div className='flex items-start justify-between gap-2'>
              <div>
                <CardTitle>
                  {editingService ? 'Edit service' : 'Schedule a service'}
                </CardTitle>
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
                <Label htmlFor='service-name'>
                  {editingService ? 'Edit service name' : 'Service name'}
                </Label>
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
                  <DateTimePicker
                    id={id}
                    value={value}
                    onChange={(date) => {
                      setValue(date)
                      setFormError('')
                    }}
                    granularity='minute'
                    hourCycle={12}
                    placeholder='Choose date and time'
                  />
                </div>
              ))}
              {formError && (
                <p
                  role='alert'
                  className='rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                >
                  {formError}
                </p>
              )}
              <Button disabled={mutation.isPending} className='w-full'>
                <CalendarPlus className='size-4' />
                {mutation.isPending
                  ? 'Saving…'
                  : editingService
                    ? 'Save changes'
                    : 'Schedule service'}
              </Button>
              {editingService && (
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  onClick={() => {
                    setEditingService(null)
                    setName('')
                    setScheduled(undefined)
                    setOpens(undefined)
                    setCloses(undefined)
                    setFormError('')
                  }}
                >
                  Cancel edit
                </Button>
              )}
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
              <CardContent className='flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between'>
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
                <div className='flex flex-wrap gap-2'>
                  {service.status === 'SCHEDULED' && (
                    <div className='space-y-1.5 sm:text-right'>
                      <div className='flex gap-2 sm:justify-end'>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={mutation.isPending}
                          onClick={() => startEditing(service)}
                        >
                          Edit service
                        </Button>
                        <Button
                          size='sm'
                          variant='destructive'
                          disabled={mutation.isPending}
                          onClick={() => {
                            setMessage('')
                            setCancelTarget(service)
                          }}
                        >
                          Delete service
                        </Button>
                      </div>
                      <Button
                        size='sm'
                        disabled={
                          mutation.isPending ||
                          !!openService ||
                          now < Date.parse(service.checkin_opens_at) ||
                          now > Date.parse(service.checkin_closes_at)
                        }
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
                      {now < Date.parse(service.checkin_opens_at) && (
                        <p className='text-xs text-muted-foreground sm:max-w-48'>
                          Check-in opens on{' '}
                          {formatDateTime(service.checkin_opens_at)}.
                        </p>
                      )}
                      {now > Date.parse(service.checkin_closes_at) && (
                        <p className='text-xs text-muted-foreground sm:max-w-48'>
                          This check-in window ended on{' '}
                          {formatDateTime(service.checkin_closes_at)}. Schedule
                          a new service to check in arrivals.
                        </p>
                      )}
                      {openService && (
                        <p className='text-xs text-muted-foreground sm:max-w-48'>
                          Close {openService.name} before opening another
                          service.
                        </p>
                      )}
                    </div>
                  )}
                  {service.status === 'CHECKIN_OPEN' && (
                    <div className='space-y-1.5 sm:text-right'>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={mutation.isPending}
                        onClick={() => {
                          setMessage('')
                          setCloseTarget(service)
                        }}
                      >
                        Close check-in
                      </Button>
                      {now > Date.parse(service.checkin_closes_at) && (
                        <p className='text-xs text-amber-700 sm:max-w-48 dark:text-amber-300'>
                          The window has ended. Close check-in to lock the final
                          count.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setCancelTarget(null)
        }}
        title={`Cancel ${cancelTarget?.name ?? 'this service'}?`}
        desc='This will hide the scheduled service without deleting its record. Services with check-ins cannot be cancelled.'
        confirmText='Cancel service now'
        destructive
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (!cancelTarget) return
          setMessage('')
          void mutation
            .mutateAsync({
              path: `/api/v1/services/${cancelTarget.id}/cancel`,
              body: {},
            })
            .then(() => {
              if (editingService?.id === cancelTarget.id)
                setEditingService(null)
              setCancelTarget(null)
            })
            .catch(() => {})
        }}
      />
      <ConfirmDialog
        open={closeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setCloseTarget(null)
        }}
        title={`Close check-in for ${closeTarget?.name ?? 'this service'}?`}
        desc='Check-in will stop immediately. The eligible-member count for turnout will be locked at the number of active members registered before check-in opened. This cannot be undone.'
        confirmText='Close check-in now'
        destructive
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (!closeTarget) return
          setMessage('')
          void mutation
            .mutateAsync({
              path: `/api/v1/services/${closeTarget.id}/close`,
              body: {},
            })
            .catch(() => {})
            .finally(() => setCloseTarget(null))
        }}
      />
    </ChurchPage>
  )
}
