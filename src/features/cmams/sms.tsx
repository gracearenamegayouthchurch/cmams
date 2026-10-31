import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Send } from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChurchPage } from './pages'

type Settings = {
  enabled: boolean
  welcome_mode: 'MANUAL' | 'IMMEDIATE' | 'DAILY'
  daily_time: string
  welcome_template: string
}
type DeliveryState = 'PENDING' | 'DELIVERED' | 'FAILED'
type Attempt = {
  outcome: 'SENT' | 'FAILED' | 'UNCERTAIN'
  attempted_at: string
  failure_reason: string | null
}
type Message = {
  id: string
  first_name: string
  last_name: string
  recipient: string
  body: string
  status: string
  delivery_state: DeliveryState
  provider_status: string | null
  delivery_checked_at: string | null
  due_at: string | null
  failure_reason: string | null
  provider_id: string | null
  attempts: Attempt[]
}

function deliveryLabel(state: DeliveryState): string {
  if (state === 'DELIVERED') return 'Delivered'
  if (state === 'FAILED') return 'Failed'
  return 'Pending'
}

function deliveryBadge(state: DeliveryState) {
  if (state === 'DELIVERED') return 'default' as const
  if (state === 'FAILED') return 'destructive' as const
  return 'secondary' as const
}

function lagosDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function SmsPage() {
  const client = useQueryClient()
  const settings = useQuery({
    queryKey: ['sms-settings'],
    queryFn: () =>
      api<{
        settings: Settings
        providerConfigured: boolean
        schedulerConfigured: boolean
      }>('/api/v1/sms/settings'),
  })
  const messages = useQuery({
    queryKey: ['sms-welcome'],
    queryFn: () => api<{ messages: Message[] }>('/api/v1/sms/welcome'),
  })
  const [draft, setDraft] = useState<Settings | null>(null)
  const current = draft ??
    settings.data?.settings ?? {
      enabled: false,
      welcome_mode: 'MANUAL' as const,
      daily_time: '18:00',
      welcome_template: '',
    }
  const {
    enabled,
    welcome_mode: mode,
    daily_time: time,
    welcome_template: template,
  } = current
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    try {
      await api('/api/v1/sms/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled,
          welcomeMode: mode,
          dailyTime: time,
          welcomeTemplate: template,
        }),
      })
      setNotice('SMS settings saved.')
      await client.invalidateQueries({ queryKey: ['sms-settings'] })
      setDraft(null)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to save settings'
      )
    } finally {
      setBusy(false)
    }
  }

  async function send(id: string) {
    if (!window.confirm('Send this welcome SMS now? This may incur charges.'))
      return
    setBusy(true)
    setNotice('')
    try {
      const result = await api<{ status: string }>(
        `/api/v1/sms/welcome/${id}/send`,
        { method: 'POST', body: '{}' }
      )
      setNotice(
        result.status === 'SENT'
          ? 'Message accepted by provider.'
          : 'Delivery outcome requires review in provider dashboard.'
      )
      await client.invalidateQueries({ queryKey: ['sms-welcome'] })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send SMS')
    } finally {
      setBusy(false)
    }
  }

  async function refresh(id: string) {
    setBusy(true)
    setNotice('')
    try {
      const result = await api<{
        deliveryState: DeliveryState
        providerStatus: string
      }>(`/api/v1/sms/welcome/${id}/refresh`, { method: 'POST', body: '{}' })
      setNotice(
        `Delivery status: ${deliveryLabel(result.deliveryState)}. Provider report: ${result.providerStatus}.`
      )
      await client.invalidateQueries({ queryKey: ['sms-welcome'] })
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to refresh delivery status'
      )
    } finally {
      setBusy(false)
    }
  }

  async function resend(message: Message) {
    if (
      !window.confirm(
        `Resend this SMS to ${message.first_name} ${message.last_name}? The provider reported delivery failed, but this sends another paid message.`
      )
    )
      return
    setBusy(true)
    setNotice('')
    try {
      const result = await api<{ status: string }>(
        `/api/v1/sms/welcome/${message.id}/resend`,
        { method: 'POST', body: '{}' }
      )
      setNotice(
        result.status === 'SENT'
          ? 'Resend accepted by provider.'
          : result.status === 'FAILED'
            ? 'Provider rejected the resend.'
            : 'Resend outcome unknown. Check the provider dashboard before trying again.'
      )
      await client.invalidateQueries({ queryKey: ['sms-welcome'] })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to resend SMS')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ChurchPage
      title='SMS'
      description='Welcome messages, live-send controls, and provider delivery status.'
    >
      <div className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>First-timer welcome SMS</CardTitle>
          </CardHeader>
          <CardContent className='space-y-5'>
            {settings.isPending ? (
              <p>Loading SMS settings…</p>
            ) : settings.error ? (
              <p role='alert'>Unable to load SMS settings.</p>
            ) : (
              settings.data && (
                <>
                  <p>
                    {settings.data.settings.enabled
                      ? 'Live SMS is on.'
                      : 'Live SMS is off. No texts will be sent.'}
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    Provider:{' '}
                    {settings.data.providerConfigured
                      ? 'configured'
                      : 'not configured'}{' '}
                    · Worker secret:{' '}
                    {settings.data.schedulerConfigured
                      ? 'configured'
                      : 'not configured'}
                    . Timed messages require an external every-minute scheduler.
                  </p>
                  <form
                    onSubmit={(event) => void save(event)}
                    className='space-y-4'
                  >
                    <div className='space-y-1'>
                      <Label htmlFor='welcome-mode'>Welcome sending mode</Label>
                      <select
                        id='welcome-mode'
                        className='w-full rounded-md border bg-background p-2'
                        value={mode}
                        onChange={(event) =>
                          setDraft({
                            ...current,
                            welcome_mode: event.target
                              .value as Settings['welcome_mode'],
                          })
                        }
                      >
                        <option value='MANUAL'>Manual (default)</option>
                        <option value='IMMEDIATE'>
                          Automatic after enrollment
                        </option>
                        <option value='DAILY'>
                          Automatic at selected daily time
                        </option>
                      </select>
                    </div>
                    <div className='space-y-1'>
                      <Label htmlFor='welcome-time'>
                        Daily time (Africa/Lagos)
                      </Label>
                      <Input
                        id='welcome-time'
                        type='time'
                        value={time}
                        onChange={(event) =>
                          setDraft({
                            ...current,
                            daily_time: event.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label htmlFor='welcome-text'>Welcome text</Label>
                      <textarea
                        id='welcome-text'
                        className='min-h-24 w-full rounded-md border bg-background p-2'
                        value={template}
                        onChange={(event) =>
                          setDraft({
                            ...current,
                            welcome_template: event.target.value,
                          })
                        }
                        maxLength={1400}
                        required
                      />
                      <p className='text-xs text-muted-foreground'>
                        Use {'{firstName}'} for the visitor’s name. Message
                        content is fixed when enrolled.
                      </p>
                    </div>
                    <label className='flex items-center gap-2'>
                      <input
                        type='checkbox'
                        checked={enabled}
                        onChange={(event) =>
                          setDraft({
                            ...current,
                            enabled: event.target.checked,
                          })
                        }
                        disabled={
                          !settings.data.providerConfigured ||
                          !settings.data.schedulerConfigured
                        }
                      />{' '}
                      Enable live SMS sending
                    </label>
                    <Button
                      type='submit'
                      disabled={
                        busy ||
                        (enabled &&
                          (!settings.data.providerConfigured ||
                            !settings.data.schedulerConfigured))
                      }
                    >
                      Save SMS settings
                    </Button>
                  </form>
                </>
              )
            )}
            {notice && <p role='status'>{notice}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent welcome messages</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {messages.isPending ? (
              <p>Loading welcome messages…</p>
            ) : messages.error ? (
              <p role='alert'>Unable to load messages.</p>
            ) : (
              messages.data &&
              (messages.data.messages.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No welcome messages yet.
                </p>
              ) : (
                messages.data.messages.map((message) => {
                  const lastAttempt = message.attempts[0]
                  return (
                    <div
                      className='rounded-md border p-3 text-sm'
                      key={message.id}
                    >
                      <div className='flex flex-wrap items-center gap-2'>
                        <p className='font-medium'>
                          {message.first_name} {message.last_name}
                        </p>
                        <Badge variant='outline'>{message.status}</Badge>
                        <Badge variant={deliveryBadge(message.delivery_state)}>
                          {deliveryLabel(message.delivery_state)}
                        </Badge>
                      </div>
                      <p className='mt-1'>
                        {message.recipient} · {message.body}
                      </p>
                      {message.due_at && (
                        <p>Due: {lagosDateTime(message.due_at)} WAT</p>
                      )}
                      {message.failure_reason && (
                        <p>{message.failure_reason}</p>
                      )}
                      {message.attempts.length > 0 && (
                        <p className='text-xs text-muted-foreground'>
                          Attempts: {message.attempts.length}
                          {lastAttempt &&
                            ` · Last: ${lastAttempt.outcome} on ${lagosDateTime(lastAttempt.attempted_at)}`}
                          {lastAttempt?.failure_reason &&
                            ` · ${lastAttempt.failure_reason}`}
                        </p>
                      )}
                      {message.provider_status && (
                        <p className='text-xs text-muted-foreground'>
                          Provider report: {message.provider_status}
                        </p>
                      )}
                      {message.delivery_checked_at && (
                        <p className='text-xs text-muted-foreground'>
                          Delivery checked:{' '}
                          {lagosDateTime(message.delivery_checked_at)}
                        </p>
                      )}
                      <div className='mt-2 flex flex-wrap gap-2'>
                        {message.status === 'HELD' && (
                          <Button
                            type='button'
                            size='sm'
                            disabled={
                              busy ||
                              !settings.data?.settings.enabled ||
                              !settings.data?.providerConfigured
                            }
                            onClick={() => void send(message.id)}
                          >
                            Send now
                          </Button>
                        )}
                        {message.provider_id &&
                          ['SENT', 'FAILED', 'UNCERTAIN'].includes(
                            message.status
                          ) && (
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              aria-label={`Refresh delivery status for ${message.first_name}`}
                              disabled={
                                busy || !settings.data?.providerConfigured
                              }
                              onClick={() => void refresh(message.id)}
                            >
                              <RefreshCw className='size-4' />
                              Refresh status
                            </Button>
                          )}
                        {message.status === 'SENT' &&
                          message.delivery_state === 'FAILED' && (
                            <Button
                              type='button'
                              size='sm'
                              variant='destructive'
                              aria-label={`Resend SMS to ${message.first_name}`}
                              disabled={
                                busy || !settings.data?.settings.enabled
                              }
                              onClick={() => void resend(message)}
                            >
                              <Send className='size-4' />
                              Resend
                            </Button>
                          )}
                      </div>
                    </div>
                  )
                })
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </ChurchPage>
  )
}
