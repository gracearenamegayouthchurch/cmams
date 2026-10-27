import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BrowserQRCodeReader } from '@zxing/browser'
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Keyboard,
  ScanLine,
  XCircle,
} from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { describeScanOutcome } from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { createScanLock } from './scan-lock'
import { ServicePicker } from './service-picker'
import { type Service } from './types'

type Outcome = {
  outcome: string
  message?: string
  checked_in_at?: string
  person?: { full_name: string; member_code: string }
}

type RecentScan = Outcome & { id: string; at: string; code: string }

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
  const [recent, setRecent] = useState<RecentScan[]>([])
  const [busy, setBusy] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const cooldown = useRef(createScanLock())
  const wedge = useRef({ text: '', last: 0 })
  const openServices =
    services.data?.services.filter((item) => item.status === 'CHECKIN_OPEN') ??
    []
  const activeId = serviceId || openServices[0]?.id || ''

  const checkIn = useCallback(
    async (credential: string) => {
      if (!activeId || !cooldown.current.accept(credential)) return
      setBusy(true)
      setStatus(null)
      const stamp = new Date().toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
      const displayCode = credential.startsWith('cma://')
        ? 'QR card'
        : credential.toUpperCase()
      try {
        const response = await api<Outcome>(
          `/api/v1/services/${activeId}/check-ins`,
          {
            method: 'POST',
            body: JSON.stringify({ credential, eventId: crypto.randomUUID() }),
          }
        )
        setStatus(response)
        setRecent((prev) =>
          [
            {
              ...response,
              id: crypto.randomUUID(),
              at: stamp,
              code: displayCode,
            },
            ...prev,
          ].slice(0, 5)
        )
        signal(response.outcome)
      } catch (error) {
        const failure: Outcome = {
          outcome: 'NETWORK_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Connection failed. Try again.',
        }
        setStatus(failure)
        setRecent((prev) =>
          [
            {
              ...failure,
              id: crypto.randomUUID(),
              at: stamp,
              code: displayCode,
            },
            ...prev,
          ].slice(0, 5)
        )
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
    const onScan = (result: { getText: () => string } | undefined) => {
      if (!cancelled && result) void checkIn(result.getText())
    }
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
        onScan
      )
      .catch(() =>
        reader.decodeFromVideoDevice(undefined, videoElement, onScan)
      )
      .then((value) => {
        if (cancelled) value.stop()
        else controls = value
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError(
            'Camera access is unavailable. Allow camera permissions in your browser, or enter the 6-character card code below.'
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
  const statusCopy = status
    ? describeScanOutcome(status.outcome, status.message)
    : null

  return (
    <ChurchPage
      title='Check-in'
      description='Scan a member QR card or enter its 6-character code.'
    >
      <div className='max-w-3xl space-y-6'>
        <QueryState
          loading={services.isPending}
          error={services.error}
          onRetry={() => void services.refetch()}
        />

        {services.data && (
          <div className='space-y-4'>
            <ServicePicker
              activeOnly
              label='Open service'
              services={services.data.services}
              value={activeId}
              onChange={(id) => {
                setServiceId(id)
                setCameraOn(false)
                setStatus(null)
              }}
            />
            {openServices.length === 0 && (
              <div className='flex items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-50/70 p-4 text-sm dark:bg-amber-950/30'>
                <AlertTriangle
                  className='mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400'
                  aria-hidden='true'
                />
                <div>
                  <p className='font-medium'>No service is open for check-in</p>
                  <p className='mt-0.5 text-muted-foreground'>
                    Ask a supervisor to open check-in on the Services page
                    before scanning arrivals.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {status && statusCopy && (
          <div
            role='status'
            aria-live='assertive'
            className={`flex items-start gap-3.5 rounded-xl border p-4 shadow-2xs ${
              good
                ? 'border-emerald-500/60 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100'
                : duplicate
                  ? 'border-amber-500/60 bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100'
                  : 'border-rose-500/60 bg-rose-50 text-rose-950 dark:bg-rose-950/60 dark:text-rose-100'
            }`}
          >
            {good ? (
              <CheckCircle2
                className='mt-0.5 size-6 shrink-0 text-emerald-600 dark:text-emerald-400'
                aria-hidden='true'
              />
            ) : duplicate ? (
              <Clock
                className='mt-0.5 size-6 shrink-0 text-amber-600 dark:text-amber-400'
                aria-hidden='true'
              />
            ) : (
              <XCircle
                className='mt-0.5 size-6 shrink-0 text-rose-600 dark:text-rose-400'
                aria-hidden='true'
              />
            )}
            <div className='min-w-0 flex-1'>
              <p className='text-lg leading-snug font-semibold'>
                {statusCopy.heading}
              </p>
              <p className='mt-0.5 text-sm opacity-90'>
                {status.person
                  ? `${status.person.full_name} · ${status.person.member_code}`
                  : statusCopy.detail}
              </p>
            </div>
          </div>
        )}

        <Card className='overflow-hidden'>
          <CardContent className='space-y-5 pt-6'>
            <div className='relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-sky-300 sm:min-h-[340px]'>
              <video
                ref={video}
                muted
                playsInline
                autoPlay
                className={`absolute inset-0 size-full object-cover ${cameraOn ? '' : 'hidden'}`}
                aria-label='QR camera view'
              />
              <div className='absolute top-3 left-3 z-10'>
                <Badge
                  variant='secondary'
                  className='border-white/15 bg-slate-900/80 text-xs text-slate-200 backdrop-blur'
                >
                  {cameraOn ? 'Camera active' : 'Camera paused'}
                </Badge>
              </div>
              {!cameraOn && (
                <div className='relative px-6 text-center'>
                  <ScanLine className='mx-auto size-12 opacity-75' />
                  <p className='mt-3 text-sm font-medium text-slate-200'>
                    Ready to scan
                  </p>
                  <p className='mt-1 text-xs text-slate-400'>
                    Start the camera to scan QR cards, or type the card code
                    below.
                  </p>
                </div>
              )}
              {cameraOn && (
                <div
                  aria-hidden='true'
                  className='pointer-events-none relative size-48 rounded-2xl border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] sm:size-56'
                />
              )}
            </div>

            {cameraError && (
              <p role='alert' className='text-sm text-destructive'>
                {cameraError}
              </p>
            )}

            <div className='flex flex-wrap items-center gap-3'>
              <Button
                type='button'
                disabled={!activeId}
                variant={cameraOn ? 'outline' : 'default'}
                className='w-full sm:w-auto'
                onClick={() => {
                  setCameraError('')
                  setCameraOn((enabled) => !enabled)
                }}
              >
                {cameraOn ? (
                  <>
                    <CameraOff className='size-4' />
                    Stop camera
                  </>
                ) : (
                  <>
                    <Camera className='size-4' />
                    Start camera
                  </>
                )}
              </Button>
            </div>

            <div className='border-t pt-5'>
              <form onSubmit={submit} className='space-y-2'>
                <Label htmlFor='short-code'>Card code (shortcode)</Label>
                <div className='flex flex-wrap gap-2'>
                  <Input
                    id='short-code'
                    value={shortCode}
                    onChange={(event) =>
                      setShortCode(event.target.value.toUpperCase())
                    }
                    placeholder='9K4-M7X'
                    autoComplete='off'
                    className='max-w-[220px] font-mono tracking-wider uppercase'
                  />
                  <Button
                    type='submit'
                    disabled={!activeId || busy || !shortCode.trim()}
                  >
                    <Keyboard className='size-4' />
                    {busy ? 'Checking…' : 'Check in'}
                  </Button>
                </div>
                <p className='text-xs text-muted-foreground'>
                  USB barcode scanners also work automatically while this page
                  is open.
                </p>
              </form>
            </div>
          </CardContent>
        </Card>

        {recent.length > 0 && (
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Recent scans (this session)
              </CardTitle>
            </CardHeader>
            <CardContent className='divide-y text-sm'>
              {recent.map((entry) => {
                const entryLabel =
                  entry.outcome === 'CHECKED_IN'
                    ? 'Recorded'
                    : entry.outcome === 'ALREADY_CHECKED_IN'
                      ? 'Duplicate'
                      : 'Declined'
                const entryBadge =
                  entry.outcome === 'CHECKED_IN'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200'
                    : entry.outcome === 'ALREADY_CHECKED_IN'
                      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-200'
                      : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-200'
                return (
                  <div
                    key={entry.id}
                    className='flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0'
                  >
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>
                        {entry.person
                          ? `${entry.person.full_name} (${entry.person.member_code})`
                          : entry.code}
                      </p>
                      <p className='truncate font-mono text-xs text-muted-foreground'>
                        {entry.code}
                      </p>
                    </div>
                    <div className='flex shrink-0 items-center gap-2.5'>
                      <Badge variant='outline' className={entryBadge}>
                        {entryLabel}
                      </Badge>
                      <span className='text-xs text-muted-foreground tabular-nums'>
                        {entry.at}
                      </span>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </ChurchPage>
  )
}
