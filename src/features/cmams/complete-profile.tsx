import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouter, useRouteContext } from '@tanstack/react-router'
import { CheckCircle2, CreditCard, Sparkles } from 'lucide-react'
import { api, type Staff } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { homeForRole } from './access'
import { CardDownloads } from './cards'
import { formatRole } from './format'
import { ChurchPage } from './pages'
import { REGIONS } from './regions'
import { type IssuedCard } from './types'

type ProfileResponse = {
  staff: Staff & { must_complete_profile?: boolean; person_id?: string | null }
  person: {
    id: string
    member_code: string
    first_name: string
    last_name: string
    phone_e164: string | null
    email: string
    room: string | null
    birth_month: number
    birth_day: number
    birth_year: number | null
    academic_level: string | null
    compound_id: string | null
    compound_name: string | null
    region: string | null
    department_id: string | null
    department_name: string | null
    card_short_code: string | null
  } | null
  catalogs: {
    compounds: { id: string; name: string; region: string }[]
    departments: { id: string; name: string }[]
    regions: { code: string; label: string }[]
  }
}

const ACADEMIC_LEVELS = [
  '100 Level',
  '200 Level',
  '300 Level',
  '400 Level',
  '500 Level',
  'Postgraduate',
  'Graduate / Working Class',
] as const

const MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

export function CompleteProfilePage() {
  const { staff } = useRouteContext({ from: '/_authenticated' })
  const router = useRouter()
  const navigate = useNavigate()

  const profileQuery = useQuery({
    queryKey: ['staff-profile'],
    queryFn: () => api<ProfileResponse>('/api/v1/profile'),
  })

  const [phone, setPhone] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [region, setRegion] = useState('HOSTEL')
  const [compoundName, setCompoundName] = useState('')
  const [room, setRoom] = useState('')
  const [academicLevel, setAcademicLevel] = useState('100 Level')
  const [birthMonth, setBirthMonth] = useState('1')
  const [birthDay, setBirthDay] = useState('1')
  const [birthYear, setBirthYear] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [issuedCard, setIssuedCard] = useState<IssuedCard | null>(null)
  const [success, setSuccess] = useState(false)

  // Populate from existing record if already linked
  useEffect(() => {
    if (profileQuery.data?.person) {
      const p = profileQuery.data.person
      if (p.phone_e164) setPhone(p.phone_e164)
      if (p.department_id) setDepartmentId(p.department_id)
      if (p.region) setRegion(p.region)
      if (p.compound_name) setCompoundName(p.compound_name)
      if (p.room) setRoom(p.room)
      if (p.academic_level) setAcademicLevel(p.academic_level)
      if (p.birth_month) setBirthMonth(String(p.birth_month))
      if (p.birth_day) setBirthDay(String(p.birth_day))
      if (p.birth_year) setBirthYear(String(p.birth_year))
    }
  }, [profileQuery.data])

  const catalogs = profileQuery.data?.catalogs
  const filteredCompounds =
    catalogs?.compounds.filter((c) => c.region === region) ?? []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!compoundName.trim()) {
      setError('Please enter or select your hostel / compound.')
      return
    }

    setBusy(true)
    try {
      const res = await api<{
        ok: boolean
        personId: string
        cardShortCode?: string
      }>('/api/v1/profile', {
        method: 'POST',
        body: JSON.stringify({
          phone: phone.trim() || null,
          departmentId: departmentId || null,
          region,
          compoundName: compoundName.trim(),
          room: room.trim() || null,
          academicLevel: academicLevel || null,
          birthMonth: Number(birthMonth),
          birthDay: Number(birthDay),
          birthYear: birthYear.trim() ? Number(birthYear) : null,
        }),
      })

      if (res.cardShortCode) {
        setIssuedCard({
          shortCode: res.cardShortCode,
          memberCode: 'CMAMS Worker',
          memberName: staff.full_name,
          credential: `cma://v1/${res.cardShortCode}`,
          phone: phone.trim() || null,
        })
      }
      setSuccess(true)
      await router.invalidate()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not complete profile. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function skip() {
    setBusy(true)
    try {
      await api('/api/v1/profile/skip', { method: 'POST', body: '{}' })
      await router.invalidate()
      await navigate({ to: (homeForRole[staff.role] ?? '/dashboard') as '/' })
    } catch {
      await navigate({ to: (homeForRole[staff.role] ?? '/dashboard') as '/' })
    } finally {
      setBusy(false)
    }
  }

  async function continueToApp() {
    await router.invalidate()
    await navigate({ to: (homeForRole[staff.role] ?? '/dashboard') as '/' })
  }

  if (success) {
    return (
      <ChurchPage
        title='Profile Complete'
        description='Your member record and church check-in badge are ready.'
      >
        <div className='max-w-2xl space-y-6'>
          <Card className='border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20'>
            <CardHeader className='pb-3'>
              <div className='flex items-center gap-2 text-emerald-600 dark:text-emerald-400'>
                <CheckCircle2 className='size-5' />
                <CardTitle className='text-lg'>
                  Welcome to Grace Arena Mega Youth Church!
                </CardTitle>
              </div>
              <CardDescription>
                Your worker account is now linked to your church member profile.
                Your department assignment has been recorded.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4 pt-1'>
              <div className='grid gap-2 text-sm sm:grid-cols-2'>
                <div className='rounded-md border bg-card p-3'>
                  <span className='text-xs text-muted-foreground'>
                    Staff Role
                  </span>
                  <p className='font-medium'>{formatRole(staff.role)}</p>
                </div>
                <div className='rounded-md border bg-card p-3'>
                  <span className='text-xs text-muted-foreground'>
                    Department
                  </span>
                  <p className='font-medium'>
                    {catalogs?.departments.find((d) => d.id === departmentId)
                      ?.name ?? 'Assigned'}
                  </p>
                </div>
              </div>

              {issuedCard && <CardDownloads card={issuedCard} />}
            </CardContent>
            <CardFooter className='pt-2'>
              <Button
                type='button'
                className='w-full sm:w-auto'
                onClick={() => void continueToApp()}
              >
                Continue to Dashboard
              </Button>
            </CardFooter>
          </Card>
        </div>
      </ChurchPage>
    )
  }

  return (
    <ChurchPage
      title='Complete your member profile'
      description='Link your church department, academic level, and hostel to issue your worker check-in badge.'
    >
      <div className='max-w-2xl space-y-6'>
        <Card>
          <CardHeader>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='space-y-1'>
                <CardTitle className='flex items-center gap-2 text-lg'>
                  <Sparkles className='size-4 text-sky-600' />
                  <span>Personal & Church Details</span>
                </CardTitle>
                <CardDescription>
                  Every worker and leader in GAMYC is also a valued member of
                  the family.
                </CardDescription>
              </div>
              <Badge variant='outline'>{formatRole(staff.role)}</Badge>
            </div>
          </CardHeader>

          <CardContent>
            {error && (
              <div
                role='alert'
                className='mb-5 rounded-md border border-rose-500/40 bg-rose-50/50 p-3 text-sm text-rose-700 dark:bg-rose-950/25 dark:text-rose-300'
              >
                {error}
              </div>
            )}

            <form
              id='complete-profile-form'
              onSubmit={(e) => void submit(e)}
              className='space-y-5'
            >
              {/* Account summary (read-only) */}
              <div className='grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2'>
                <div>
                  <span className='text-xs text-muted-foreground'>
                    Full Name
                  </span>
                  <p className='text-sm font-medium'>{staff.full_name}</p>
                </div>
                <div>
                  <span className='text-xs text-muted-foreground'>
                    Email Address
                  </span>
                  <p className='text-sm font-medium'>{staff.email}</p>
                </div>
              </div>

              <div className='grid gap-4 sm:grid-cols-2'>
                {/* Phone */}
                <div className='space-y-1 sm:col-span-2'>
                  <Label htmlFor='phone'>Phone number (WhatsApp)</Label>
                  <Input
                    id='phone'
                    type='tel'
                    placeholder='e.g. 08012345678 or +234...'
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <p className='text-[11px] text-muted-foreground'>
                    Used for leader announcements and check-in assistance.
                  </p>
                </div>

                {/* Department */}
                <div className='space-y-1 sm:col-span-2'>
                  <Label htmlFor='department'>Church Department</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger id='department'>
                      <SelectValue placeholder='Select your department' />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogs?.departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Campus Region */}
                <div className='space-y-1'>
                  <Label htmlFor='region'>Campus Region / Area</Label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger id='region'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r.code} value={r.code}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Compound / Hostel */}
                <div className='space-y-1'>
                  <Label htmlFor='compound'>Hostel / Compound Name</Label>
                  <Input
                    id='compound'
                    required
                    placeholder='e.g. Bethel, Zion, Main Campus'
                    list='profile-compounds'
                    value={compoundName}
                    onChange={(e) => setCompoundName(e.target.value)}
                  />
                  <datalist id='profile-compounds'>
                    {filteredCompounds.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>

                {/* Room */}
                <div className='space-y-1'>
                  <Label htmlFor='room'>Room Number (Optional)</Label>
                  <Input
                    id='room'
                    placeholder='e.g. Room 14'
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                  />
                </div>

                {/* Academic Level */}
                <div className='space-y-1'>
                  <Label htmlFor='level'>Academic Level</Label>
                  <Select
                    value={academicLevel}
                    onValueChange={setAcademicLevel}
                  >
                    <SelectTrigger id='level'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACADEMIC_LEVELS.map((lvl) => (
                        <SelectItem key={lvl} value={lvl}>
                          {lvl}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Birthday Month & Day */}
                <div className='space-y-1'>
                  <Label htmlFor='birth-month'>Birth Month</Label>
                  <Select value={birthMonth} onValueChange={setBirthMonth}>
                    <SelectTrigger id='birth-month'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1'>
                  <Label htmlFor='birth-day'>Birth Day (1 - 31)</Label>
                  <Input
                    id='birth-day'
                    type='number'
                    min={1}
                    max={31}
                    required
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                  />
                </div>
              </div>
            </form>
          </CardContent>

          <CardFooter className='flex flex-wrap items-center justify-between gap-3 border-t bg-muted/15 p-4'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              disabled={busy}
              onClick={() => void skip()}
            >
              Skip for now
            </Button>
            <Button
              type='submit'
              form='complete-profile-form'
              disabled={busy}
              className='gap-2'
            >
              <CreditCard className='size-4' />
              <span>{busy ? 'Saving...' : 'Save Profile & Get Badge'}</span>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </ChurchPage>
  )
}
