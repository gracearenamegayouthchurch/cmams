import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CardDownloads } from './cards'
import { formatStage, stageBadgeClass } from './format'
import { ChurchPage } from './pages'
import { REGIONS } from './regions'
import { ServicePicker } from './service-picker'
import {
  type IssuedCard,
  type PaginatedPeople,
  type Person,
  type Service,
} from './types'
import { useDebouncedValue } from './use-debounced-value'

export function DeskPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Person | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [region, setRegion] = useState('')
  const [compoundName, setCompoundName] = useState('')
  const [compoundFocused, setCompoundFocused] = useState(false)
  const [departmentId, setDepartmentId] = useState('')
  const [cellId, setCellId] = useState('')
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
        compounds: { id: string; name: string; region: string }[]
        departments: { id: string; name: string }[]
        regions: { code: string; label: string }[]
      }>('/api/v1/catalogs'),
  })
  const cells = useQuery({
    queryKey: ['cells'],
    queryFn: () =>
      api<{ cells: { id: string; name: string; region: string }[] }>(
        '/api/v1/cells'
      ),
  })
  const debouncedMemberSearch = useDebouncedValue(memberSearch)
  const memberResults = useQuery({
    queryKey: ['desk-members', debouncedMemberSearch],
    queryFn: () =>
      api<PaginatedPeople>(
        `/api/v1/people?q=${encodeURIComponent(debouncedMemberSearch)}&page=1&pageSize=10`
      ),
    enabled: mode === 'existing' && debouncedMemberSearch.trim().length > 0,
  })
  const activeId =
    serviceId ||
    services.data?.services.find((service) => service.status === 'CHECKIN_OPEN')
      ?.id ||
    ''
  const compounds = catalogs.data?.compounds ?? []
  const normalizedItemName = (value: string) =>
    value.trim().replace(/\s+/g, ' ').toLowerCase()
  const normalizedCompound = normalizedItemName(compoundName)
  const regionCompounds = compounds.filter((item) => item.region === region)
  const compoundSuggestions = (
    normalizedCompound
      ? regionCompounds.filter((item) =>
          normalizedItemName(item.name).includes(normalizedCompound)
        )
      : regionCompounds
  ).slice(0, 8)
  const crossRegionCompounds =
    normalizedCompound.length >= 2
      ? compounds
          .filter(
            (item) =>
              item.region !== region &&
              normalizedItemName(item.name).includes(normalizedCompound)
          )
          .slice(0, 3)
      : []
  const exactCompound = regionCompounds.find(
    (item) => normalizedItemName(item.name) === normalizedCompound
  )
  const regionLabel = (code: string) =>
    catalogs.data?.regions.find((item) => item.code === code)?.label ?? code
  const memberMatches = memberResults.data?.people ?? []
  const memberSearchPending =
    memberSearch.trim().length > 0 &&
    (memberSearch !== debouncedMemberSearch || memberResults.isFetching)

  function chooseMode(next: 'new' | 'existing') {
    setMode(next)
    setError('')
    setMessage('')
  }

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
    if (
      !region ||
      !compoundName.trim() ||
      !birthMonth ||
      !birthDay ||
      !email.trim()
    ) {
      setError('Enter email, region, compound, birth month and birth day.')
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
          region,
          compoundName: compoundName.trim(),
          room: room || undefined,
          departmentId: departmentId || undefined,
          cellId: cellId || undefined,
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
      void queryClient.invalidateQueries({
        queryKey: ['registration-catalogs'],
      })
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
      if (
        reason instanceof ApiError &&
        reason.code === 'COMPOUND_REGION_CONFLICT'
      ) {
        setError(reason.message)
      } else if (reason instanceof ApiError && reason.status === 409) {
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
      description='Register a new member or find an existing member to check in.'
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

      <div className='mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-muted/30 px-4 py-3'>
        <span className='text-sm font-medium'>Registering</span>
        <RadioGroup
          aria-label='Registration type'
          value={mode}
          onValueChange={(value) =>
            chooseMode(value === 'existing' ? 'existing' : 'new')
          }
          className='flex flex-wrap gap-x-6 gap-y-2'
        >
          <div className='flex items-center gap-2'>
            <RadioGroupItem value='new' id='registration-new' />
            <Label htmlFor='registration-new'>New member</Label>
          </div>
          <div className='flex items-center gap-2'>
            <RadioGroupItem value='existing' id='registration-existing' />
            <Label htmlFor='registration-existing'>Existing member</Label>
          </div>
        </RadioGroup>
      </div>

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]'>
        <Card className='h-fit'>
          <CardHeader>
            <CardTitle>
              {mode === 'new' ? 'New registration' : 'Existing member'}
            </CardTitle>
            <CardDescription>
              {mode === 'new'
                ? 'One profile per person. Family members can share a phone number.'
                : 'Search by name or member code, then check the person in.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mode === 'new' ? (
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
                    Include country code (e.g. +234). Leave blank if
                    unavailable.
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
                    <Label htmlFor='region'>Region</Label>
                    <Select
                      value={region}
                      onValueChange={(value) => {
                        setRegion(value)
                        setCandidates([])
                        setConfirmed(false)
                      }}
                    >
                      <SelectTrigger id='region' className='w-full'>
                        <SelectValue placeholder='Select region' />
                      </SelectTrigger>
                      <SelectContent>
                        {(catalogs.data?.regions ?? []).map((item) => (
                          <SelectItem key={item.code} value={item.code}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-1.5 sm:col-span-2'>
                    <Label htmlFor='compound'>Compound</Label>
                    <Input
                      id='compound'
                      required
                      maxLength={100}
                      autoComplete='off'
                      value={compoundName}
                      placeholder='Type the compound name'
                      onFocus={() => setCompoundFocused(true)}
                      onBlur={() => setCompoundFocused(false)}
                      onChange={(event) => {
                        setCompoundName(event.target.value)
                        setCandidates([])
                        setConfirmed(false)
                      }}
                      aria-describedby='compound-help'
                    />
                    <p
                      id='compound-help'
                      className='text-xs text-muted-foreground'
                    >
                      Type what the member says. New compounds are saved
                      automatically under the selected region.
                    </p>
                    {compoundFocused &&
                      region &&
                      (compoundSuggestions.length > 0 ||
                        crossRegionCompounds.length > 0) && (
                        <div className='rounded-lg border bg-background p-1 shadow-sm'>
                          {compoundSuggestions.map((item) => (
                            <button
                              key={item.id}
                              type='button'
                              className='block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted'
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => setCompoundName(item.name)}
                            >
                              {item.name}
                            </button>
                          ))}
                          {crossRegionCompounds.map((item) => (
                            <button
                              key={item.id}
                              type='button'
                              className='block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted'
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setCompoundName(item.name)
                                setRegion(item.region)
                              }}
                            >
                              <span className='text-amber-700 dark:text-amber-300'>
                                Already under {regionLabel(item.region)}:
                              </span>{' '}
                              {item.name}
                            </button>
                          ))}
                        </div>
                      )}
                    {exactCompound && (
                      <p className='text-xs text-emerald-700 dark:text-emerald-300'>
                        Using the saved compound “{exactCompound.name}”.
                      </p>
                    )}
                    {!region && compoundName.trim() && (
                      <p className='text-xs text-muted-foreground'>
                        Choose a region to see compounds already saved there.
                      </p>
                    )}
                  </div>
                </div>
                {catalogs.isPending && (
                  <p role='status' className='text-sm text-muted-foreground'>
                    Loading registration choices…
                  </p>
                )}
                {catalogs.error && (
                  <p role='alert' className='text-sm text-destructive'>
                    Could not load regions, compounds and departments. Retry by
                    refreshing this page.
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

                <div className='space-y-1.5'>
                  <Label htmlFor='cell'>Cell group (optional)</Label>
                  <Select
                    value={cellId || 'none'}
                    onValueChange={(value) =>
                      setCellId(value === 'none' ? '' : value)
                    }
                  >
                    <SelectTrigger id='cell' className='w-full'>
                      <SelectValue placeholder='No cell group' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='none'>No cell group</SelectItem>
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
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {cells.error && (
                    <p role='alert' className='text-sm text-destructive'>
                      Cell choices could not load. Refresh before assigning a
                      cell.
                    </p>
                  )}
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
                    Grace Arena stores your name, email, region and compound,
                    room (if given), birthday (year optional), department (if
                    given), phone (if given), cell group (if joined),
                    church-service and Saturday cell attendance for church
                    records and pastoral follow-up. Cell leaders may view the
                    full profile of members in their cell, but not
                    church-service attendance history.
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
                        onCheckedChange={(value) =>
                          setConfirmed(value === true)
                        }
                      />
                      <Label
                        htmlFor='distinct'
                        className='text-sm leading-snug'
                      >
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
                    (candidates.length > 0 && !confirmed)
                  }
                >
                  {busy ? 'Saving…' : 'Register person'}
                </Button>
              </form>
            ) : (
              <div className='space-y-4'>
                <div className='space-y-1.5'>
                  <Label htmlFor='member-search'>Search members by name, phone or code</Label>
                  <div className='relative'>
                    <Search
                      className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                      aria-hidden='true'
                    />
                    <Input
                      id='member-search'
                      className='pl-9'
                      autoComplete='off'
                      value={memberSearch}
                      onChange={(event) => {
                        setMemberSearch(event.target.value)
                        setSelectedMember(null)
                      }}
                      placeholder='Name, phone or code'
                    />
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Search by name, phone number or member code before creating a new record.
                  </p>
                </div>

                {memberSearch.trim().length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    Start typing a name, phone number or member code.
                  </p>
                ) : memberSearchPending ? (
                  <p role='status' className='text-sm text-muted-foreground'>
                    Searching members…
                  </p>
                ) : memberResults.error ? (
                  <p role='alert' className='text-sm text-destructive'>
                    Could not search members. Check your connection and try
                    again.
                  </p>
                ) : memberMatches.length === 0 ? (
                  <div className='rounded-xl border border-dashed p-4'>
                    <p className='text-sm font-medium'>
                      No existing member found.
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      Check the spelling, or register this person as a new
                      member.
                    </p>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      className='mt-3'
                      onClick={() => chooseMode('new')}
                    >
                      Register as new member
                    </Button>
                  </div>
                ) : (
                  <div className='space-y-2'>
                    {memberMatches.map((match) => {
                      const selected = selectedMember?.id === match.id
                      return (
                        <button
                          key={match.id}
                          type='button'
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedMember(match)
                            setError('')
                            setMessage('')
                          }}
                          className={`block w-full rounded-xl border p-3.5 text-left transition-colors ${
                            selected
                              ? 'border-sky-500/60 bg-sky-50/70 dark:bg-sky-950/30'
                              : 'bg-muted/20 hover:bg-muted/40'
                          }`}
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
                            {formatStage(match.lifecycle_stage)}
                            {match.last_attended_at
                              ? ` · Last attended ${new Date(
                                  match.last_attended_at
                                ).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}`
                              : ' · No prior check-in'}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className='space-y-5'>
          {mode === 'new' && person && (
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

          {mode === 'new' && card && (
            <CardDownloads key={card.shortCode} card={card} />
          )}

          {mode === 'new' ? (
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
                        onChange={(event) =>
                          setManualReason(event.target.value)
                        }
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
          ) : selectedMember ? (
            <Card className='border-sky-500/35'>
              <CardHeader className='pb-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <CardTitle className='text-base'>
                    {selectedMember.first_name} {selectedMember.last_name}
                  </CardTitle>
                  <div className='flex items-center gap-2'>
                    <Badge variant='outline' className='font-mono'>
                      {selectedMember.member_code}
                    </Badge>
                    <Badge
                      variant='outline'
                      className={stageBadgeClass(
                        selectedMember.lifecycle_stage
                      )}
                    >
                      {formatStage(selectedMember.lifecycle_stage)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='space-y-4 pt-0'>
                <dl className='grid gap-3 text-sm sm:grid-cols-2'>
                  <div>
                    <dt className='text-xs text-muted-foreground'>Phone</dt>
                    <dd>{selectedMember.phone ?? 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      Last attended
                    </dt>
                    <dd>
                      {selectedMember.last_attended_at
                        ? new Date(
                            selectedMember.last_attended_at
                          ).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'No prior check-in'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>Check-ins</dt>
                    <dd className='tabular-nums'>
                      {selectedMember.attendance_count ?? 0}
                    </dd>
                  </div>
                </dl>
                {activeId ? (
                  <>
                    <ServicePicker
                      activeOnly
                      label='Open service'
                      services={services.data?.services ?? []}
                      value={activeId}
                      onChange={setServiceId}
                    />
                    <div className='space-y-1.5'>
                      <Label htmlFor='existing-reason'>
                        Reason for manual check-in
                      </Label>
                      <Input
                        id='existing-reason'
                        value={manualReason}
                        onChange={(event) =>
                          setManualReason(event.target.value)
                        }
                        placeholder='Forgot card at home'
                      />
                    </div>
                    <Button
                      type='button'
                      disabled={busy || manualReason.trim().length < 3}
                      onClick={() => void manualCheckin(selectedMember)}
                    >
                      <UserCheck className='size-4' />
                      Check in
                    </Button>
                  </>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    No service is open for check-in. Open a service first.
                  </p>
                )}
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => setSelectedMember(null)}
                >
                  Clear selection
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Member check-in</CardTitle>
                <CardDescription>
                  Select a search result to view the profile and check the
                  person in.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </ChurchPage>
  )
}
