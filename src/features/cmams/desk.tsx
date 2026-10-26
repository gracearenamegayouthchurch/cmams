import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardDownloads } from './cards'
import { ChurchPage } from './pages'
import { ServicePicker } from './service-picker'
import { type IssuedCard, type Person, type Service } from './types'

export function DeskPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
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
  const activeId =
    serviceId ||
    services.data?.services.find((service) => service.status === 'CHECKIN_OPEN')
      ?.id ||
    ''

  async function checkDuplicates() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter a first and last name before searching.')
      return
    }
    setBusy(true)
    setError('')
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
          }),
        }
      )
      setCandidates(response.matches)
      if (!response.matches.length)
        setMessage('No likely match found. You may register this person.')
      else setMessage('Review these profiles before creating a new one.')
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Duplicate search failed'
      )
    } finally {
      setBusy(false)
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    setCard(null)
    try {
      const response = await api<{ person: Person }>('/api/v1/people', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          phone: phone || null,
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
        setMessage(
          'Profile registered and credential generated. Download the card now.'
        )
      } catch {
        setError(
          `Profile ${response.person.member_code} was created, but its card could not be issued. Ask a supervisor to issue it.`
        )
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409)
        setError(
          'A likely match already exists. Search for duplicates and confirm a distinct person if appropriate.'
        )
      else
        setError(
          reason instanceof Error ? reason.message : 'Registration failed'
        )
    } finally {
      setBusy(false)
    }
  }

  async function manualCheckin(existing: Person) {
    if (!activeId || manualReason.trim().length < 3) {
      setError(
        'Select an open service and enter a reason (at least 3 characters).'
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
            reason: manualReason,
          }),
        }
      )
      setMessage(
        `${existing.first_name} ${existing.last_name}: ${result.outcome.replace(/_/g, ' ').toLowerCase()}.`
      )
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
      description='Search for a likely match, record consent, and issue a credential for a new person.'
    >
      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,1fr)]'>
        <Card>
          <CardHeader>
            <CardTitle>Person details</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void register(event)}
              className='space-y-4'
            >
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='first-name'>First name</Label>
                  <Input
                    id='first-name'
                    required
                    value={firstName}
                    onChange={(event) => {
                      setFirstName(event.target.value)
                      setCandidates([])
                      setConfirmed(false)
                    }}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='last-name'>Last name</Label>
                  <Input
                    id='last-name'
                    required
                    value={lastName}
                    onChange={(event) => {
                      setLastName(event.target.value)
                      setCandidates([])
                      setConfirmed(false)
                    }}
                  />
                </div>
              </div>
              <div className='space-y-2'>
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
                  Use international format. Family members may share a number.
                </p>
              </div>
              <Button
                variant='outline'
                type='button'
                onClick={() => void checkDuplicates()}
                disabled={busy}
              >
                Check for matches
              </Button>
              <div className='rounded-md border bg-muted/30 p-4 text-sm'>
                <p>
                  We use your name, optional phone number, and service
                  attendance to manage church records and support pastoral care.
                  Staff will protect this information and use it only for church
                  purposes.
                </p>
                <div className='mt-3 flex items-start gap-3'>
                  <Checkbox
                    id='consent'
                    checked={consent}
                    onCheckedChange={(value) => setConsent(value === true)}
                  />
                  <Label htmlFor='consent' className='leading-snug'>
                    The person has read or heard this notice and agrees to this
                    use of their information.
                  </Label>
                </div>
              </div>
              {candidates.length > 0 && (
                <div className='space-y-2'>
                  <div className='flex items-start gap-3'>
                    <Checkbox
                      id='distinct'
                      checked={confirmed}
                      onCheckedChange={(value) => setConfirmed(value === true)}
                    />
                    <Label htmlFor='distinct' className='leading-snug'>
                      I reviewed the matches and confirm this is a different
                      person.
                    </Label>
                  </div>
                  {householdId && (
                    <p className='text-xs text-sky-700'>
                      Linked to the selected household.
                    </p>
                  )}
                </div>
              )}
              <Button
                type='submit'
                disabled={
                  busy || !consent || (candidates.length > 0 && !confirmed)
                }
              >
                {busy ? 'Working…' : 'Register person'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className='space-y-5'>
          <Card>
            <CardHeader>
              <CardTitle>Possible matches</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {candidates.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  Enter details and check for matches before registering. A
                  shared phone number does not mean two people are the same.
                </p>
              ) : (
                <>
                  <ServicePicker
                    activeOnly
                    services={services.data?.services ?? []}
                    value={activeId}
                    onChange={setServiceId}
                  />
                  <div className='space-y-2'>
                    <Label htmlFor='manual-reason'>
                      Reason for manual check-in
                    </Label>
                    <Input
                      id='manual-reason'
                      value={manualReason}
                      onChange={(event) => setManualReason(event.target.value)}
                      placeholder='Visitor has no card'
                    />
                  </div>
                  {candidates.map((match) => (
                    <div key={match.id} className='rounded-lg border p-3'>
                      <strong>
                        {match.first_name} {match.last_name}
                      </strong>
                      <p className='text-sm text-muted-foreground'>
                        {match.member_code} ·{' '}
                        {match.shared_phone
                          ? 'Shares phone number'
                          : 'Similar name'}
                      </p>
                      <div className='mt-3 flex flex-wrap gap-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={busy || !activeId}
                          onClick={() => void manualCheckin(match)}
                        >
                          Use profile & check in
                        </Button>
                        {match.household_id && (
                          <Button
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
                </>
              )}
            </CardContent>
          </Card>
          {person && (
            <p className='text-sm'>
              Registered profile: <strong>{person.member_code}</strong> · ID:{' '}
              <code className='break-all'>{person.id}</code>
            </p>
          )}
          {card && <CardDownloads card={card} />}
        </div>
      </div>
      {message && (
        <p role='status' className='mt-5 text-sm text-sky-700'>
          {message}
        </p>
      )}
      {error && (
        <p role='alert' className='mt-5 text-sm text-destructive'>
          {error}
        </p>
      )}
    </ChurchPage>
  )
}
