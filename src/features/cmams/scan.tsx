import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BrowserQRCodeReader } from '@zxing/browser'
import { Camera, Keyboard, ScanLine } from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { createScanLock } from './scan-lock'
import { ServicePicker } from './service-picker'
import { type Service } from './types'

type Outcome = {
  outcome: string
  message?: string
  person?: { full_name: string; member_code: string }
}

function signal(outcome: string) {
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = outcome === 'CHECKED_IN' ? 880 : 330
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.12)
    oscillator.onended = () => void context.close()
    navigator.vibrate?.(outcome === 'CHECKED_IN' ? 80 : [50, 60, 50])
  } catch {
    /* Audio and haptics are optional; visual feedback remains authoritative. */
  }
}

export function ScanPage() {
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })
  const [serviceId, setServiceId] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [status, setStatus] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const cooldown = useRef(createScanLock())
  const wedge = useRef({ text: '', last: 0 })
  const activeId =
    serviceId ||
    services.data?.services.find((item) => item.status === 'CHECKIN_OPEN')
      ?.id ||
    ''

  const checkIn = useCallback(
    async (credential: string) => {
      if (!activeId || !cooldown.current.accept(credential)) return
      setBusy(true)
      setStatus(null)
      try {
        const response = await api<Outcome>(
          `/api/v1/services/${activeId}/check-ins`,
          {
            method: 'POST',
            body: JSON.stringify({ credential, eventId: crypto.randomUUID() }),
          }
        )
        setStatus(response)
        signal(response.outcome)
      } catch (error) {
        setStatus({
          outcome: 'NETWORK_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Check-in could not be recorded',
        })
      } finally {
        setBusy(false)
      }
    },
    [activeId]
  )

  useEffect(() => {
    if (!cameraOn || !activeId || !video.current) return
    const videoElement = video.current
    let cancelled = false
    let controls: { stop: () => void } | undefined
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 100,
    })
    void reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoElement,
        (result) => {
          if (!cancelled && result) void checkIn(result.getText())
        }
      )
      .then((value) => {
        if (cancelled) value.stop()
        else controls = value
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError(
            'Camera unavailable. Enter the shortcode or connect a USB scanner.'
          )
          setCameraOn(false)
        }
      })
    return () => {
      cancelled = true
      controls?.stop()
      if (videoElement.srcObject instanceof MediaStream)
        videoElement.srcObject.getTracks().forEach((track) => track.stop())
    }
  }, [cameraOn, activeId, checkIn])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return
      const now = performance.now()
      if (event.key === 'Enter') {
        if (wedge.current.text.length >= 10) void checkIn(wedge.current.text)
        wedge.current.text = ''
        return
      }
      if (event.key.length !== 1) return
      if (now - wedge.current.last > 40) wedge.current.text = ''
      wedge.current.text += event.key
      wedge.current.last = now
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [checkIn])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (shortCode.trim()) {
      void checkIn(shortCode.trim())
      setShortCode('')
    }
  }
  const good = status?.outcome === 'CHECKED_IN'
  const duplicate = status?.outcome === 'ALREADY_CHECKED_IN'
  return (
    <ChurchPage
      title='Check-in scanner'
      description='Select the open service, then scan a card or enter its six-character code.'
    >
      <div className='max-w-3xl space-y-6'>
        <QueryState
          loading={services.isPending}
          error={services.error}
          onRetry={() => void services.refetch()}
        />
        {services.data && (
          <ServicePicker
            activeOnly
            services={services.data.services}
            value={activeId}
            onChange={(id) => {
              setServiceId(id)
              setCameraOn(false)
              setStatus(null)
            }}
          />
        )}
        <Card className='overflow-hidden'>
          <CardContent className='space-y-4 pt-6'>
            <div className='relative flex min-h-[270px] items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-sky-300 sm:min-h-[350px]'>
              <video
                ref={video}
                muted
                playsInline
                autoPlay
                className={`absolute inset-0 size-full object-cover ${cameraOn ? '' : 'hidden'}`}
                aria-label='QR camera view'
              />
              {!cameraOn && (
                <div className='relative text-center'>
                  <ScanLine className='mx-auto size-16 opacity-80' />
                  <p className='mt-3 text-sm'>Camera is off</p>
                </div>
              )}
              {cameraOn && (
                <div
                  aria-hidden='true'
                  className='pointer-events-none relative size-48 rounded-2xl border-2 border-sky-300 sm:size-56'
                />
              )}
            </div>
            {cameraError && (
              <p role='alert' className='text-sm text-destructive'>
                {cameraError}
              </p>
            )}
            <Button
              disabled={!activeId}
              variant={cameraOn ? 'outline' : 'default'}
              onClick={() => {
                setCameraError('')
                setCameraOn((enabled) => !enabled)
              }}
            >
              <Camera className='mr-2 size-4' />
              {cameraOn ? 'Stop camera' : 'Start camera'}
            </Button>
            <form onSubmit={submit} className='space-y-2'>
              <Label htmlFor='short-code'>Shortcode fallback</Label>
              <div className='flex gap-2'>
                <Input
                  id='short-code'
                  value={shortCode}
                  onChange={(event) => setShortCode(event.target.value)}
                  placeholder='9K4-M7X'
                  autoComplete='off'
                  className='max-w-xs font-mono tracking-wider'
                />
                <Button disabled={!activeId || busy || !shortCode.trim()}>
                  <Keyboard className='mr-2 size-4' />
                  Check in
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                USB scanner input also works when focus is outside this field.
              </p>
            </form>
          </CardContent>
        </Card>
        {status && (
          <div
            role='status'
            aria-live='assertive'
            className={`rounded-xl border p-5 ${good ? 'border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100' : duplicate ? 'border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100' : 'border-rose-500 bg-rose-50 text-rose-950 dark:bg-rose-950 dark:text-rose-100'}`}
          >
            <strong className='text-xl'>
              {good
                ? 'Checked in'
                : duplicate
                  ? 'Already checked in'
                  : 'Not checked in'}
            </strong>
            <p className='mt-1'>
              {status.person
                ? `${status.person.full_name} · ${status.person.member_code}`
                : status.message || status.outcome.replace(/_/g, ' ')}
            </p>
          </div>
        )}
      </div>
    </ChurchPage>
  )
}
