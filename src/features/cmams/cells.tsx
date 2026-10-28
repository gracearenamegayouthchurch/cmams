import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BrowserQRCodeReader } from '@zxing/browser'
import { api, getSession } from '@/lib/cmams-api'
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { REGIONS, regionLabel } from './regions'
import { createScanLock } from './scan-lock'
import { type PaginatedPeople } from './types'

type Cell = {
  id: string
  name: string
  meeting_location: string
  region: string
  is_active: boolean
}
type Leader = { id: string; full_name: string; cell_id: string | null }
type Member = {
  id: string
  member_code: string
  first_name: string
  middle_name: string | null
  last_name: string
  phone_e164: string | null
  email: string | null
  compound_name: string | null
  compound_region: string | null
  room: string | null
  birth_month: number | null
  birth_day: number | null
  birth_year: number | null
  department_name: string | null
}
type Meeting = {
  id: string
  scheduled_start_at: string
  checkin_opens_at: string
  checkin_closes_at: string
  status: string
  attendance_count: number
}
type Attendance = {
  id: string
  person_id: string
  first_name: string
  last_name: string
  member_code: string
  checked_in_at: string
}

const dateTime = (value: string) =>
  new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value)) + ' WAT'

// DateTimePicker presents the chosen wall-clock time; interpret it as church
// time even when the staff member's device is set to another time zone.
function watInstant(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return new Date(
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00+01:00`
  ).toISOString()
}

export function CellsPage() {
  const client = useQueryClient()
  const session = useQuery({
    queryKey: ['session', 'cells'],
    queryFn: getSession,
  })
  const role = session.data?.staff.role
  const manager = role === 'ADMIN' || role === 'PASTOR_VIEWER'
  const cells = useQuery({
    queryKey: ['cells'],
    queryFn: () => api<{ cells: Cell[] }>('/api/v1/cells'),
  })
  const leaders = useQuery({
    queryKey: ['cell-leaders'],
    queryFn: () => api<{ leaders: Leader[] }>('/api/v1/cell-leaders'),
    enabled: manager,
  })
  const [selectedId, setSelectedId] = useState('')
  const selected =
    cells.data?.cells.find((cell) => cell.id === selectedId) ??
    cells.data?.cells[0]
  const members = useQuery({
    queryKey: ['cell-members', selected?.id],
    queryFn: () =>
      api<{ members: Member[] }>(`/api/v1/cells/${selected!.id}/members`),
    enabled: !!selected?.id && selected.is_active,
  })
  const meetings = useQuery({
    queryKey: ['cell-meetings', selected?.id],
    queryFn: () =>
      api<{ meetings: Meeting[] }>(`/api/v1/cells/${selected!.id}/meetings`),
    enabled: !!selected?.id,
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newRegion, setNewRegion] = useState('')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [region, setRegion] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [personId, setPersonId] = useState('')
  const [leaderId, setLeaderId] = useState('')
  const [start, setStart] = useState<Date>()
  const [opens, setOpens] = useState<Date>()
  const [closes, setCloses] = useState<Date>()

  const candidates = useQuery({
    queryKey: ['cell-people-search', memberSearch],
    queryFn: () =>
      api<PaginatedPeople>(
        `/api/v1/people?q=${encodeURIComponent(memberSearch)}&pageSize=20`
      ),
    enabled: manager && memberSearch.trim().length >= 2,
  })

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(success)
      await client.invalidateQueries({ queryKey: ['cells'] })
      await client.invalidateQueries({ queryKey: ['cell-leaders'] })
      await client.invalidateQueries({ queryKey: ['cell-members'] })
      await client.invalidateQueries({ queryKey: ['cell-meetings'] })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Action could not be completed'
      )
    } finally {
      setBusy(false)
    }
  }

  function create(event: FormEvent) {
    event.preventDefault()
    void act(async () => {
      const result = await api<{ cell: Cell }>('/api/v1/cells', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          location: newLocation,
          region: newRegion,
        }),
      })
      setNewName('')
      setNewLocation('')
      setNewRegion('')
      setSelectedId(result.cell.id)
    }, 'Cell created.')
  }

  function schedule(event: FormEvent) {
    event.preventDefault()
    if (!selected || !start || !opens || !closes) {
      setError('Choose all three meeting and check-in times.')
      return
    }
    void act(async () => {
      await api(`/api/v1/cells/${selected.id}/meetings`, {
        method: 'POST',
        body: JSON.stringify({
          start: watInstant(start),
          opens: watInstant(opens),
          closes: watInstant(closes),
        }),
      })
      setStart(undefined)
      setOpens(undefined)
      setCloses(undefined)
    }, 'Saturday meeting scheduled.')
  }

  const totalAttendance = (meetings.data?.meetings ?? []).reduce(
    (sum, item) => sum + Number(item.attendance_count),
    0
  )

  return (
    <ChurchPage
      title='Cells'
      description='Saturday fellowship groups, members, and meeting attendance.'
    >
      {error && (
        <p
          role='alert'
          className='mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive'
        >
          {error}
        </p>
      )}
      {message && (
        <p role='status' className='mb-4 rounded-lg border p-3 text-sm'>
          {message}
        </p>
      )}
      <QueryState
        loading={cells.isPending || session.isPending}
        error={cells.error || session.error}
        onRetry={() => void cells.refetch()}
      />
      {manager && (
        <Card className='mb-5'>
          <CardHeader>
            <CardTitle>Create a cell group</CardTitle>
            <CardDescription>
              Only Admins and Pastors manage groups and assignments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className='flex flex-wrap items-end gap-3' onSubmit={create}>
              <div className='min-w-40 flex-1 space-y-1'>
                <Label htmlFor='new-cell-name'>Cell name</Label>
                <Input
                  id='new-cell-name'
                  required
                  maxLength={100}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>
              <div className='min-w-40 flex-1 space-y-1'>
                <Label htmlFor='new-cell-location'>
                  Saturday meeting location
                </Label>
                <Input
                  id='new-cell-location'
                  required
                  maxLength={200}
                  value={newLocation}
                  onChange={(event) => setNewLocation(event.target.value)}
                />
              </div>
              <div className='min-w-40 flex-1 space-y-1'>
                <Label htmlFor='new-cell-region'>Region</Label>
                <Select value={newRegion} onValueChange={setNewRegion}>
                  <SelectTrigger id='new-cell-region' className='w-full'>
                    <SelectValue placeholder='Choose region' />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((entry) => (
                      <SelectItem key={entry.code} value={entry.code}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={busy || !newRegion}>Create cell</Button>
            </form>
          </CardContent>
        </Card>
      )}
      {cells.data && cells.data.cells.length === 0 && (
        <p className='rounded-lg border p-4 text-sm text-muted-foreground'>
          No cell is assigned yet. Ask an Admin or Pastor to create and assign a
          cell.
        </p>
      )}
      {selected && (
        <>
          <div className='mb-4 space-y-1.5'>
            <Label htmlFor='cell-choice'>Cell group</Label>
            <Select
              value={selected.id}
              onValueChange={(id) => {
                setSelectedId(id)
                setEditing(false)
                setPersonId('')
              }}
            >
              <SelectTrigger id='cell-choice' className='max-w-sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((group) => {
                  const groupCells = (cells.data?.cells ?? []).filter(
                    (cell) => cell.region === group.code
                  )
                  if (!groupCells.length) return null
                  return (
                    <SelectGroup key={group.code}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {groupCells.map((cell) => (
                        <SelectItem key={cell.id} value={cell.id}>
                          {cell.name}
                          {cell.is_active ? '' : ' (archived)'}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <Card className='mb-5'>
            <CardHeader>
              <CardTitle>{selected.name}</CardTitle>
              <CardDescription>
                {regionLabel(selected.region)} region · Saturday meeting place:{' '}
                {selected.meeting_location}
                {selected.is_active ? '' : ' · archived'}
              </CardDescription>
            </CardHeader>
            {manager && selected.is_active && (
              <CardContent className='space-y-4'>
                {editing ? (
                  <form
                    className='flex flex-wrap items-end gap-2'
                    onSubmit={(event) => {
                      event.preventDefault()
                      void act(
                        () =>
                          api(`/api/v1/cells/${selected.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ name, location, region }),
                          }),
                        'Cell updated.'
                      ).then(() => setEditing(false))
                    }}
                  >
                    <div className='space-y-1'>
                      <Label htmlFor='edit-cell-name'>Name</Label>
                      <Input
                        id='edit-cell-name'
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label htmlFor='edit-cell-location'>Location</Label>
                      <Input
                        id='edit-cell-location'
                        required
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label htmlFor='edit-cell-region'>Region</Label>
                      <Select value={region} onValueChange={setRegion}>
                        <SelectTrigger id='edit-cell-region' className='w-40'>
                          <SelectValue placeholder='Choose region' />
                        </SelectTrigger>
                        <SelectContent>
                          {REGIONS.map((entry) => (
                            <SelectItem key={entry.code} value={entry.code}>
                              {entry.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button disabled={busy || !region}>Save</Button>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      variant='outline'
                      onClick={() => {
                        setName(selected.name)
                        setLocation(selected.meeting_location)
                        setRegion(selected.region)
                        setEditing(true)
                      }}
                    >
                      Edit cell
                    </Button>
                    <Button
                      variant='destructive'
                      onClick={() => setArchiveOpen(true)}
                    >
                      Archive cell
                    </Button>
                  </div>
                )}
                <div className='space-y-1.5'>
                  <Label htmlFor='leader-choice'>Cell Leader</Label>
                  <Select
                    value={
                      leaderId ||
                      leaders.data?.leaders.find(
                        (item) => item.cell_id === selected.id
                      )?.id ||
                      ''
                    }
                    onValueChange={setLeaderId}
                  >
                    <SelectTrigger id='leader-choice' className='max-w-sm'>
                      <SelectValue placeholder='Choose a Cell Leader account' />
                    </SelectTrigger>
                    <SelectContent>
                      {leaders.data?.leaders.map((leader) => (
                        <SelectItem key={leader.id} value={leader.id}>
                          {leader.full_name}
                          {leader.cell_id && leader.cell_id !== selected.id
                            ? ' (move from another cell)'
                            : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size='sm'
                    disabled={busy || !leaderId}
                    onClick={() =>
                      void act(
                        () =>
                          api(`/api/v1/cells/${selected.id}/leader`, {
                            method: 'POST',
                            body: JSON.stringify({ staffId: leaderId }),
                          }),
                        'Leader assigned.'
                      )
                    }
                  >
                    Assign leader
                  </Button>
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='cell-member-search'>
                    Assign or move a registered member
                  </Label>
                  <Input
                    id='cell-member-search'
                    placeholder='Search by name or member code'
                    value={memberSearch}
                    onChange={(event) => {
                      setMemberSearch(event.target.value)
                      setPersonId('')
                    }}
                  />
                  {candidates.data && (
                    <Select value={personId} onValueChange={setPersonId}>
                      <SelectTrigger
                        className='max-w-sm'
                        aria-label='Choose member'
                      >
                        <SelectValue placeholder='Choose member' />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.data.people.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.first_name} {person.last_name} (
                            {person.member_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size='sm'
                    disabled={busy || !personId}
                    onClick={() =>
                      void act(
                        () =>
                          api(`/api/v1/cells/${selected.id}/members`, {
                            method: 'POST',
                            body: JSON.stringify({ personId }),
                          }),
                        'Member assigned to cell.'
                      )
                    }
                  >
                    Assign member
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
          {selected.is_active && (
            <Card className='mb-5'>
              <CardHeader>
                <CardTitle>Cell members</CardTitle>
                <CardDescription>
                  Full profile details are visible only within the assigned
                  cell.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                <QueryState
                  loading={members.isPending}
                  error={members.error}
                  onRetry={() => void members.refetch()}
                />
                {members.data?.members.length === 0 && (
                  <p className='text-sm text-muted-foreground'>
                    No current members assigned.
                  </p>
                )}
                {members.data?.members.map((person) => (
                  <div
                    key={person.id}
                    className='space-y-1 rounded-lg border p-3 text-sm'
                  >
                    <p className='font-semibold'>
                      {person.first_name} {person.middle_name}{' '}
                      {person.last_name} · {person.member_code}
                    </p>
                    <p>
                      Email: {person.email ?? 'Not provided'} · Phone:{' '}
                      {person.phone_e164 ?? 'Not provided'}
                    </p>
                    <p>
                      Compound: {person.compound_name ?? 'Not provided'}
                      {person.compound_region
                        ? ` (${person.compound_region.charAt(0)}${person.compound_region.slice(1).toLowerCase()})`
                        : ''}{' '}
                      · Room: {person.room ?? 'Not provided'}
                    </p>
                    <p>
                      Birthday:{' '}
                      {person.birth_month && person.birth_day
                        ? `${person.birth_day}/${person.birth_month}${person.birth_year ? `/${person.birth_year}` : ''}`
                        : 'Not provided'}{' '}
                      · Department: {person.department_name ?? 'None'}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {selected.is_active && (
            <Card className='mb-5'>
              <CardHeader>
                <CardTitle>Schedule Saturday meeting</CardTitle>
                <CardDescription>
                  Choose church local time (West Africa Time, UTC+1).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={schedule} className='grid gap-3 sm:grid-cols-3'>
                  {(
                    [
                      ['Meeting starts', start, setStart],
                      ['Check-in opens', opens, setOpens],
                      ['Check-in closes', closes, setCloses],
                    ] as const
                  ).map(([label, value, setter]) => (
                    <div className='space-y-1.5' key={label}>
                      <Label htmlFor={`cell-${label.replace(/\s/g, '-')}`}>
                        {label} (WAT)
                      </Label>
                      <DateTimePicker
                        id={`cell-${label.replace(/\s/g, '-')}`}
                        value={value}
                        onChange={setter}
                        granularity='minute'
                        hourCycle={12}
                        placeholder='Choose date and time'
                      />
                    </div>
                  ))}
                  <Button className='sm:col-span-3' disabled={busy}>
                    Schedule meeting
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Saturday attendance & analytics</CardTitle>
              <CardDescription>
                {meetings.data?.meetings.length ?? 0} meetings ·{' '}
                {totalAttendance} total cell check-ins. Church-service
                attendance is not included.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <QueryState
                loading={meetings.isPending}
                error={meetings.error}
                onRetry={() => void meetings.refetch()}
              />
              {meetings.data?.meetings.length === 0 && (
                <p className='text-sm text-muted-foreground'>
                  No meetings scheduled yet.
                </p>
              )}
              {meetings.data?.meetings.map((meeting) => (
                <MeetingRow
                  key={meeting.id}
                  meeting={meeting}
                  active={selected.is_active}
                  busy={busy}
                  onAction={(action) =>
                    void act(
                      () =>
                        api(`/api/v1/cell-meetings/${meeting.id}/${action}`, {
                          method: 'POST',
                          body: '{}',
                        }),
                      `Check-in ${action === 'open' ? 'opened' : 'closed'}.`
                    )
                  }
                />
              ))}
            </CardContent>
          </Card>
        </>
      )}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        destructive
        isLoading={busy}
        title={`Archive ${selected?.name ?? 'cell'}?`}
        desc='Historical Saturday attendance is preserved. Members and the leader will lose their active cell assignment.'
        confirmText='Archive cell'
        handleConfirm={() => {
          if (!selected) return
          void act(
            () =>
              api(`/api/v1/cells/${selected.id}/archive`, {
                method: 'POST',
                body: '{}',
              }),
            'Cell archived.'
          ).then(() => setArchiveOpen(false))
        }}
      />
    </ChurchPage>
  )
}

function MeetingRow({
  meeting,
  active,
  busy,
  onAction,
}: {
  meeting: Meeting
  active: boolean
  busy: boolean
  onAction: (action: 'open' | 'close') => void
}) {
  const client = useQueryClient()
  const [showAttendance, setShowAttendance] = useState(false)
  const [code, setCode] = useState('')
  const [scanResult, setScanResult] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [scanning, setScanning] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const inFlight = useRef(false)
  const cooldown = useRef(createScanLock())
  const [now, setNow] = useState(() => Date.now())
  const attendance = useQuery({
    queryKey: ['cell-attendance', meeting.id],
    queryFn: () =>
      api<{ attendance: Attendance[] }>(
        `/api/v1/cell-meetings/${meeting.id}/attendance`
      ),
    enabled: showAttendance,
  })
  const checkIn = useCallback(
    async (credential: string) => {
      if (
        inFlight.current ||
        !credential.trim() ||
        !cooldown.current.accept(credential.trim())
      )
        return
      inFlight.current = true
      setScanning(true)
      setScanResult('')
      try {
        const result = await api<{ outcome: string }>(
          `/api/v1/cell-meetings/${meeting.id}/check-ins`,
          {
            method: 'POST',
            body: JSON.stringify({
              credential: credential.trim(),
              eventId: crypto.randomUUID(),
            }),
          }
        )
        setScanResult(
          result.outcome === 'CHECKED_IN'
            ? 'Cell check-in recorded.'
            : 'Already checked in at this meeting.'
        )
        setCode('')
        await client.invalidateQueries({ queryKey: ['cell-meetings'] })
        await client.invalidateQueries({
          queryKey: ['cell-attendance', meeting.id],
        })
      } catch (error) {
        cooldown.current.release(credential.trim())
        setScanResult(
          error instanceof Error
            ? error.message
            : 'Scan failed; no check-in was recorded.'
        )
      } finally {
        inFlight.current = false
        setScanning(false)
      }
    },
    [client, meeting.id]
  )

  useEffect(() => {
    if (!cameraOn || !video.current) return
    const element = video.current
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
        { video: { facingMode: { ideal: 'environment' } } },
        element,
        onScan
      )
      .catch(() => reader.decodeFromVideoDevice(undefined, element, onScan))
      .then((value) => {
        if (cancelled) value.stop()
        else controls = value
      })
      .catch(() => {
        if (!cancelled) {
          setScanResult('Camera unavailable. Enter the card code instead.')
          setCameraOn(false)
        }
      })
    return () => {
      cancelled = true
      controls?.stop()
      if (element.srcObject instanceof MediaStream)
        element.srcObject.getTracks().forEach((track) => track.stop())
    }
  }, [cameraOn, checkIn])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const withinWindow =
    now >= Date.parse(meeting.checkin_opens_at) &&
    now <= Date.parse(meeting.checkin_closes_at)
  const canScan = active && meeting.status === 'CHECKIN_OPEN' && withinWindow
  return (
    <div className='space-y-2 rounded-xl border p-4 text-sm'>
      <p className='font-semibold'>
        {dateTime(meeting.scheduled_start_at)} ·{' '}
        {meeting.status.replace(/_/g, ' ')}
      </p>
      <p className='text-muted-foreground'>
        Window: {dateTime(meeting.checkin_opens_at)} –{' '}
        {dateTime(meeting.checkin_closes_at)} · {meeting.attendance_count}{' '}
        check-ins
      </p>
      <div className='flex flex-wrap gap-2'>
        {active && meeting.status === 'SCHEDULED' && (
          <Button
            size='sm'
            disabled={busy || !withinWindow}
            onClick={() => onAction('open')}
          >
            Open check-in
          </Button>
        )}
        {active && meeting.status === 'CHECKIN_OPEN' && (
          <Button
            size='sm'
            variant='outline'
            disabled={busy}
            onClick={() => onAction('close')}
          >
            Close check-in
          </Button>
        )}
        <Button
          size='sm'
          variant='outline'
          onClick={() => setShowAttendance((value) => !value)}
        >
          {showAttendance ? 'Hide attendance' : 'View attendance'}
        </Button>
      </div>
      {canScan && (
        <div className='space-y-2 rounded-lg border p-3'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => setCameraOn((value) => !value)}
          >
            {cameraOn ? 'Stop camera' : 'Scan QR card'}
          </Button>
          {cameraOn && (
            <video
              ref={video}
              className='max-h-56 w-full rounded-lg bg-black'
              muted
              playsInline
              aria-label='Cell card scanner'
            />
          )}
          <form
            className='flex flex-wrap items-end gap-2'
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              void checkIn(code)
            }}
          >
            <div className='space-y-1'>
              <Label htmlFor={`code-${meeting.id}`}>
                Card short code or QR value
              </Label>
              <Input
                id={`code-${meeting.id}`}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder='ABC-123'
              />
            </div>
            <Button disabled={scanning || !code.trim()}>Record check-in</Button>
          </form>
        </div>
      )}
      {scanResult && <p role='status'>{scanResult}</p>}
      {showAttendance && (
        <div className='space-y-1'>
          <QueryState
            loading={attendance.isPending}
            error={attendance.error}
            onRetry={() => void attendance.refetch()}
          />
          {attendance.data?.attendance.length === 0 && (
            <p>No cell check-ins recorded yet.</p>
          )}
          {attendance.data?.attendance.map((entry) => (
            <p key={entry.id}>
              {entry.first_name} {entry.last_name} ({entry.member_code}) ·{' '}
              {dateTime(entry.checked_in_at)}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
