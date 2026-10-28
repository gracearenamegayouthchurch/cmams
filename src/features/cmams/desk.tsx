import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Search, UserCheck } from 'lucide-react'
import { api, ApiError } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CardDownloads } from './cards'
import { formatStage, stageBadgeClass } from './format'
import { ChurchPage } from './pages'
import { ServicePicker } from './service-picker'
import { type IssuedCard, type Person, type Service } from './types'

export function DeskPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [compoundId, setCompoundId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [room, setRoom] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthDay, setBirthDay] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [consent, setConsent] = useState(false)
  const [candidates, setCandidates] = useState<Person[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [householdId, setHouseholdId] = useState('')
  const [person, setPerson] = useState<Person | null>(null)
  const [card, setCard] = useState<IssuedCard | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [manualReason, setManualReason] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [message, setMessage] = useState('')
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })
  const catalogs = useQuery({
    queryKey: ['registration-catalogs'],
    queryFn: () =>
      api<{
        compounds: { id: string; name: string }[]
        departments: { id: string; name: string }[]
      }>('/api/v1/catalogs'),
  })
  const activeId =
    serviceId ||
    services.data?.services.find((service) => service.status === 'CHECKIN_OPEN')
      ?.id ||
    ''

  async function checkDuplicates() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter both first and last name to check existing records.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    setCandidates([])
    setConfirmed(false)
    try {
      const response = await api<{ matches: Person[] }>(
        '/api/v1/people/duplicates',
        {
          method: 'POST',
          body: JSON.stringify({
            fullName: `${firstName} ${lastName}`,
            phone: phone || null,
            email: email.trim() || null,
          }),
        }
      )
      setCandidates(response.matches)
      if (!response.matches.length)
        setMessage('No existing match found. Ready to register.')
      else
        setMessage(
          'Found similar records. Check whether this person is already registered.'
        )
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not check records'
      )
    } finally {
      setBusy(false)
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!compoundId || !birthMonth || !birthDay || !email.trim()) {
      setError('Enter email, compound, birth month and birth day.')
      return
    }
    const month = Number(birthMonth)
    const day = Number(birthDay)
    const year = birthYear ? Number(birthYear) : 2000
    const birthday = new Date(Date.UTC(year, month - 1, day))
    if (
      birthday.getUTCFullYear() !== year ||
      birthday.getUTCMonth() !== month - 1 ||
      birthday.getUTCDate() !== day
    ) {
      setError(
        'Choose a valid birth month and day; check the year if you entered one.'
      )
      return
    }
    setBusy(true)
    setCard(null)
    try {
      const response = await api<{ person: Person }>('/api/v1/people', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          phone: phone || null,
          email,
          compoundId,
          room: room || undefined,
          departmentId: departmentId || undefined,
          birthMonth: Number(birthMonth),
          birthDay: Number(birthDay),
          birthYear: birthYear ? Number(birthYear) : undefined,
          consent,
          confirmDistinct: confirmed,
          ...(householdId ? { householdId } : {}),
        }),
      })
      setPerson(response.person)
      setCandidates([])
      try {
        const issued = await api<{ card: IssuedCard }>(
          `/api/v1/people/${response.person.id}/cards`,
          { method: 'POST', body: '{}' }
        )
        setCard(issued.card)
        setMessage('Registered and check-in card generated.')
      } catch {
        setError(
          `Registered ${response.person.member_code}, but the card could not be generated. Ask a supervisor to issue it on the Cards page.`
        )
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setError(
          'A similar record already exists. Click "Check for matches" to review before registering.'
        )
      } else {
        setError(
          reason instanceof Error ? reason.message : 'Registration failed'
        )
      }
    } finally {
      setBusy(false)
    }
  }

  async function manualCheckin(existing: Person, defaultReason?: string) {
    const reasonText = (defaultReason ?? manualReason).trim()
    if (!activeId || reasonText.length < 3) {
      setError(
        'Choose an open service and enter a brief reason (3+ characters).'
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<{ outcome: string }>(
        `/api/v1/services/${activeId}/manual-check-ins`,
        {
          method: 'POST',
          body: JSON.stringify({
            personId: existing.id,
            eventId: crypto.randomUUID(),
            reason: reasonText,
          }),
        }
      )
      const label =
        result.outcome === 'CHECKED_IN'
          ? 'checked in'
          : result.outcome === 'ALREADY_CHECKED_IN'
            ? 'already checked in'
            : 'not checked in (service closed)'
      setMessage(`${existing.first_name} ${existing.last_name} — ${label}.`)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Check-in was not recorded'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <ChurchPage
      title='Registration desk'
      description='Check for an existing record, capture consent, and issue a check-in card.'
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
      {error && (
        <div
          role='alert'
          className='mb-6 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive'
        >
          {error}
        </div>
      )}

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]'>
        <Card className='h-fit'>
          <CardHeader>
            <CardTitle>New registration</CardTitle>
            <CardDescription>
              One profile per person. Family members can share a phone number.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void register(event)}
              className='space-y-4'
            >
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-1.5'>
                  <Label htmlFor='first-name'>First name</Label>
                  <Input
                    id='first-name'
                    required
                    placeholder='Ada'
                    value={firstName}
                    onChange={(event) => {
                      setFirstName(event.target.value)
                      setCandidates([])
                      setConfirmed(false)
                    }}
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='last-name'>Last name</Label>
                  <Input
                    id='last-name'
                    required
                    placeholder='Okafor'
                    value={lastName}
                    onChange={(event) => {
                      setLastName(event.target.value)
                      setCandidates([])
                      setConfirmed(false)
                    }}
                  />
                </div>
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='phone'>Phone number (optional)</Label>
                <Input
                  id='phone'
                  type='tel'
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value)
                    setCandidates([])
                    setConfirmed(false)
                  }}
                  placeholder='+2348031234567'
                />
                <p className='text-xs text-muted-foreground'>
                  Include country code (e.g. +234). Leave blank if unavailable.
                </p>
              </div>

              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-1.5'>
                  <Label htmlFor='email'>Email</Label>
                  <Input
                    id='email'
                    type='email'
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setCandidates([])
                      setConfirmed(false)
                    }}
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='compound'>Compound</Label>
                  <Select
                    value={compoundId}
                    onValueChange={(value) => {
                      setCompoundId(value)
                      setCandidates([])
                      setConfirmed(false)
                    }}
                  >
                    <SelectTrigger id='compound' className='w-full'>
                      <SelectValue placeholder='Select compound' />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogs.data?.compounds.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {catalogs.isPending && (
                <p role='status' className='text-sm text-muted-foreground'>
                  Loading registration choices…
                </p>
              )}
              {catalogs.error && (
                <p role='alert' className='text-sm text-destructive'>
                  Could not load compounds and departments. Retry by refreshing
                  this page.
                </p>
              )}
              {catalogs.data?.compounds.length === 0 && (
                <p role='alert' className='text-sm text-destructive'>
                  No active compound is available. Ask an Admin to add one
                  before registering.
                </p>
              )}

              <div className='grid gap-4 sm:grid-cols-3'>
                <div className='space-y-1.5'>
                  <Label htmlFor='birth-month'>Birth month</Label>
                  <Select value={birthMonth} onValueChange={setBirthMonth}>
                    <SelectTrigger id='birth-month' className='w-full'>
                      <SelectValue placeholder='Month' />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, index) => (
                        <SelectItem key={index + 1} value={String(index + 1)}>
                          {new Date(2000, index).toLocaleString('en', {
                            month: 'long',
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='birth-day'>Birth day</Label>
                  <Input
                    id='birth-day'
                    type='number'
                    min={1}
                    max={31}
                    required
                    value={birthDay}
                    onChange={(event) => setBirthDay(event.target.value)}
                    placeholder='Day'
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='birth-year'>Birth year (optional)</Label>
                  <Input
                    id='birth-year'
                    type='number'
                    min={1900}
                    max={new Date().getFullYear()}
                    value={birthYear}
                    onChange={(event) => setBirthYear(event.target.value)}
                    placeholder='Leave blank'
                  />
                </div>
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-1.5'>
                  <Label htmlFor='room'>Room (optional)</Label>
                  <Input
                    id='room'
                    maxLength={100}
                    value={room}
                    onChange={(event) => setRoom(event.target.value)}
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='department'>
                    Active department (optional)
                  </Label>
                  <Select
                    value={departmentId || 'none'}
                    onValueChange={(value) =>
                      setDepartmentId(value === 'none' ? '' : value)
                    }
                  >
                    <SelectTrigger id='department' className='w-full'>
                      <SelectValue placeholder='No department' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='none'>No department</SelectItem>
                      {catalogs.data?.departments.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Button
                  variant='outline'
                  size='sm'
                  type='button'
                  onClick={() => void checkDuplicates()}
                  disabled={busy}
                >
                  <Search className='size-4' />
                  Check for matches
                </Button>
              </div>

              <div className='rounded-xl border bg-muted/30 p-4 text-sm'>
                <p className='font-medium text-foreground'>Privacy notice</p>
                <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
                  Grace Arena stores your name, email, compound, room (if
                  given), birthday (year optional), department (if given), phone
                  (if given), and service attendance for church records and
                  pastoral follow-up.
                </p>
                <div className='mt-3 flex items-start gap-2.5'>
                  <Checkbox
                    id='consent'
                    checked={consent}
                    onCheckedChange={(value) => setConsent(value === true)}
                  />
                  <Label htmlFor='consent' className='text-sm leading-snug'>
                    Person agrees to this privacy notice
                  </Label>
                </div>
              </div>

              {candidates.length > 0 && (
                <div className='space-y-2 rounded-xl border border-amber-500/35 bg-amber-50/60 p-3.5 dark:bg-amber-950/25'>
                  <div className='flex items-start gap-2.5'>
                    <Checkbox
                      id='distinct'
                      checked={confirmed}
                      onCheckedChange={(value) => setConfirmed(value === true)}
                    />
                    <Label htmlFor='distinct' className='text-sm leading-snug'>
                      I checked the matches and confirm this is a different
                      person
                    </Label>
                  </div>
                  {householdId && (
                    <p className='text-xs text-sky-700 dark:text-sky-300'>
                      Linked to selected family household.
                    </p>
                  )}
                </div>
              )}

              <Button
                type='submit'
                className='w-full sm:w-auto'
                disabled={
                  busy ||
                  !consent ||
                  catalogs.isPending ||
                  !!catalogs.error ||
                  !catalogs.data?.compounds.length ||
                  (candidates.length > 0 && !confirmed)
                }
              >
                {busy ? 'Saving…' : 'Register person'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className='space-y-5'>
          {person && (
            <Card className='border-sky-500/35'>
              <CardHeader className='pb-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <CardTitle className='text-base'>
                    {person.first_name} {person.last_name}
                  </CardTitle>
                  <div className='flex items-center gap-2'>
                    <Badge variant='outline' className='font-mono'>
                      {person.member_code}
                    </Badge>
                    <Badge
                      variant='outline'
                      className={stageBadgeClass(person.lifecycle_stage)}
                    >
                      {formatStage(person.lifecycle_stage)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {activeId && (
                <CardContent className='pt-0'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={busy}
                    onClick={() =>
                      void manualCheckin(person, 'Registered at desk')
                    }
                  >
                    <UserCheck className='size-4' />
                    Check in to open service
                  </Button>
                </CardContent>
              )}
            </Card>
          )}

          {card && <CardDownloads key={card.shortCode} card={card} />}

          <Card>
            <CardHeader>
              <CardTitle>Matching records</CardTitle>
              <CardDescription>
                Use an existing profile instead of creating a duplicate.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {candidates.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  Enter a name or phone number and click &ldquo;Check for
                  matches&rdquo; to search existing profiles.
                </p>
              ) : (
                <>
                  <ServicePicker
                    activeOnly
                    label='Open service (for manual check-in)'
                    services={services.data?.services ?? []}
                    value={activeId}
                    onChange={setServiceId}
                  />
                  <div className='space-y-1.5'>
                    <Label htmlFor='manual-reason'>
                      Reason for manual check-in
                    </Label>
                    <Input
                      id='manual-reason'
                      value={manualReason}
                      onChange={(event) => setManualReason(event.target.value)}
                      placeholder='Forgot card at home'
                    />
                  </div>
                  <div className='space-y-3'>
                    {candidates.map((match) => (
                      <div
                        key={match.id}
                        className='rounded-xl border bg-muted/20 p-3.5'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <strong className='text-sm'>
                            {match.first_name} {match.last_name}
                          </strong>
                          <span className='font-mono text-xs text-muted-foreground'>
                            {match.member_code}
                          </span>
                        </div>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {match.shared_phone
                            ? 'Shares phone number'
                            : 'Similar name'}
                        </p>
                        <div className='mt-3 flex flex-wrap gap-2'>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={busy || !activeId}
                            onClick={() => void manualCheckin(match)}
                          >
                            Use profile & check in
                          </Button>
                          {match.household_id && (
                            <Button
                              type='button'
                              size='sm'
                              variant='ghost'
                              onClick={() => {
                                setHouseholdId(match.household_id ?? '')
                                setConfirmed(true)
                              }}
                            >
                              Register as family member
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ChurchPage>
  )
}
