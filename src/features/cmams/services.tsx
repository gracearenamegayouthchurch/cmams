import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  ScanLine,
} from 'lucide-react'
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
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'OPEN' | 'SCHEDULED' | 'CLOSED'
  >('ALL')

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
  const allServices = services.data?.services ?? []
  const orderedServices = [...allServices].sort((a, b) => {
    if (a.status === 'CHECKIN_OPEN' && b.status !== 'CHECKIN_OPEN') return -1
    if (a.status !== 'CHECKIN_OPEN' && b.status === 'CHECKIN_OPEN') return 1
    return 0
  })
  const visibleServices = orderedServices.filter((item) => {
    if (statusFilter === 'OPEN') return item.status === 'CHECKIN_OPEN'
    if (statusFilter === 'SCHEDULED') return item.status === 'SCHEDULED'
    if (statusFilter === 'CLOSED') return item.status === 'CHECKIN_CLOSED'
    return true
  })

  function resetForm() {
    setName('')
    setCategory('SUNDAY_SERVICE')
    setScheduled(undefined)
    setOpens(undefined)
    setCloses(undefined)
    setEditingService(null)
    setFormError('')
  }

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
      resetForm()
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
                      if (id === 'scheduled' && date && !editingService) {
                        if (!opens) {
                          setOpens(new Date(date.getTime() - 60 * 60 * 1000))
                        }
                        if (!closes) {
                          setCloses(
                            new Date(date.getTime() + 3 * 60 * 60 * 1000)
                          )
                        }
                      }
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
                  onClick={resetForm}
                >
                  Cancel edit
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <div className='space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-2.5'>
              <h2 className='text-base font-semibold'>Scheduled & recent</h2>
              {services.data && (
                <Badge variant='secondary' className='tabular-nums'>
                  {allServices.length} total
                </Badge>
              )}
            </div>
            {allServices.length > 0 && (
              <div
                role='group'
                aria-label='Filter services by status'
                className='inline-flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs'
              >
                {(
                  [
                    ['ALL', 'All'],
                    ['OPEN', 'Open'],
                    ['SCHEDULED', 'Scheduled'],
                    ['CLOSED', 'Closed'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type='button'
                    onClick={() => setStatusFilter(key)}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                      statusFilter === key
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
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
          {allServices.length > 0 && visibleServices.length === 0 && (
            <QueryState
              loading={false}
              error={null}
              empty
              emptyTitle='No matching services'
              emptyDescription='Try switching the status filter above.'
            />
          )}
          {visibleServices.map((service) => {
            const isOpen = service.status === 'CHECKIN_OPEN'
            return (
              <Card
                key={service.id}
                className={
                  isOpen
                    ? 'border-emerald-500/45 bg-emerald-50/25 dark:bg-emerald-950/15'
                    : undefined
                }
              >
                <CardContent className='flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='min-w-0 space-y-1.5'>
                    <div className='flex flex-wrap items-center gap-2.5'>
                      <h3 className='font-semibold'>{service.name}</h3>
                      <Badge
                        variant='outline'
                        className={serviceStatusClass(service.status)}
                      >
                        {isOpen && (
                          <span
                            className='mr-1.5 inline-block size-1.5 rounded-full bg-emerald-500'
                            aria-hidden='true'
                          />
                        )}
                        {formatServiceStatus(service.status)}
                      </Badge>
                    </div>
                    <p className='text-sm text-muted-foreground'>
                      {formatCategory(service.category)} ·{' '}
                      {formatDateTime(service.scheduled_start_at)}
                    </p>
                    <p className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                      <Clock className='size-3.5 shrink-0' aria-hidden='true' />
                      <span>
                        Window:{' '}
                        {formatTimeRange(
                          service.checkin_opens_at,
                          service.checkin_closes_at
                        )}
                      </span>
                      {service.attendance_count !== undefined &&
                        service.status !== 'SCHEDULED' && (
                          <span>
                            · {service.attendance_count} checked in
                          </span>
                        )}
                      {service.locked_eligible_member_count !== null && (
                        <span>
                          · {service.locked_eligible_member_count} eligible
                        </span>
                      )}
                    </p>
                  </div>
                  <div className='flex shrink-0 flex-col gap-2 sm:items-end'>
                    {service.status === 'SCHEDULED' && (
                      <>
                        <div className='flex flex-wrap items-center gap-2 sm:justify-end'>
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
                        </div>
                        {now < Date.parse(service.checkin_opens_at) && (
                          <p className='text-xs text-muted-foreground sm:text-right'>
                            Check-in opens on{' '}
                            {formatDateTime(service.checkin_opens_at)}.
                          </p>
                        )}
                        {now > Date.parse(service.checkin_closes_at) && (
                          <p className='text-xs text-muted-foreground sm:text-right'>
                            This check-in window ended on{' '}
                            {formatDateTime(service.checkin_closes_at)}.
                          </p>
                        )}
                        {openService && (
                          <p className='text-xs text-muted-foreground sm:text-right'>
                            Close {openService.name} before opening another.
                          </p>
                        )}
                      </>
                    )}
                    {isOpen && (
                      <>
                        <div className='flex flex-wrap items-center gap-2 sm:justify-end'>
                          <Button size='sm' variant='outline' asChild>
                            <Link to='/dashboard'>
                              <LayoutDashboard className='size-3.5' />
                              Dashboard
                            </Link>
                          </Button>
                          <Button size='sm' asChild>
                            <Link to='/scan'>
                              <ScanLine className='size-3.5' />
                              Open scanner
                            </Link>
                          </Button>
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
                        </div>
                        {now > Date.parse(service.checkin_closes_at) && (
                          <p className='text-xs text-amber-700 sm:text-right dark:text-amber-300'>
                            Window ended. Close check-in to lock final turnout.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
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
