import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Staff } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
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
import { formatRole } from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'

type StaffEntry = Staff & {
  is_active: boolean
  created_at: string
  last_login_at: string | null
  must_change_password: boolean
}
const roles: Staff['role'][] = [
  'USHER_SCANNER',
  'REGISTRATION_DESK',
  'SERVICE_SUPERVISOR',
  'PASTOR_VIEWER',
  'ADMIN',
]

export function StaffPage() {
  const queryClient = useQueryClient()
  const staff = useQuery({
    queryKey: ['staff'],
    queryFn: () => api<{ staff: StaffEntry[] }>('/api/v1/staff'),
  })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Staff['role']>('USHER_SCANNER')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [oneTime, setOneTime] = useState<{
    email: string
    password: string
  } | null>(null)

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    setOneTime(null)
    try {
      const result = await api<{
        staff: StaffEntry
        temporaryPassword: string
      }>('/api/v1/staff', {
        method: 'POST',
        body: JSON.stringify({ fullName: name, email, role }),
      })
      setOneTime({
        email: result.staff.email,
        password: result.temporaryPassword,
      })
      setName('')
      setEmail('')
      await queryClient.invalidateQueries({ queryKey: ['staff'] })
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not create account'
      )
    } finally {
      setBusy(false)
    }
  }

  async function change(
    person: StaffEntry,
    update: { role?: Staff['role']; isActive?: boolean }
  ) {
    if (!window.confirm(`Change access for ${person.full_name}?`)) return
    setBusy(true)
    setError('')
    setNotice('')
    setOneTime(null)
    try {
      await api(`/api/v1/staff/${person.id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      })
      setNotice(
        'Staff access updated. Existing sessions for this person have been invalidated.'
      )
      await queryClient.invalidateQueries({ queryKey: ['staff'] })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not update staff access'
      )
    } finally {
      setBusy(false)
    }
  }

  async function reset(person: StaffEntry) {
    if (
      !window.confirm(
        `Reset the password for ${person.full_name}? They will need the new temporary password to sign in.`
      )
    )
      return
    setBusy(true)
    setError('')
    setNotice('')
    setOneTime(null)
    try {
      const result = await api<{ temporaryPassword: string }>(
        `/api/v1/staff/${person.id}/reset-password`,
        { method: 'POST', body: '{}' }
      )
      setOneTime({ email: person.email, password: result.temporaryPassword })
      await queryClient.invalidateQueries({ queryKey: ['staff'] })
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not reset password'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <ChurchPage
      title='Staff'
      description='Create staff accounts and control access by role.'
    >
      <div className='max-w-5xl space-y-5'>
        {error && (
          <p
            role='alert'
            className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
          >
            {error}
          </p>
        )}
        {notice && (
          <p role='status' className='rounded-lg border p-3 text-sm'>
            {notice}
          </p>
        )}
        {oneTime && (
          <Card className='border-amber-500/50'>
            <CardHeader>
              <CardTitle>Temporary password — shown once</CardTitle>
              <CardDescription>
                Give this directly to {oneTime.email} using a secure channel. It
                will not be available after you dismiss it or leave this page.
                They must change it at first sign-in.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Input
                aria-label='Temporary password'
                readOnly
                value={oneTime.password}
                className='font-mono'
              />
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(oneTime.password)
                    } catch {
                      setError(
                        'Could not copy. Select and copy the password manually.'
                      )
                    }
                  }}
                >
                  Copy password
                </Button>
                <Button type='button' onClick={() => setOneTime(null)}>
                  I saved it securely
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Add staff</CardTitle>
            <CardDescription>
              Each person gets their own account. Only administrators can manage
              staff.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void create(event)}
              className='grid gap-3 sm:grid-cols-2'
            >
              <div className='space-y-1'>
                <Label htmlFor='staff-name'>Full name</Label>
                <Input
                  id='staff-name'
                  required
                  minLength={2}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='staff-email'>Email</Label>
                <Input
                  id='staff-email'
                  type='email'
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='staff-role'>Role</Label>
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as Staff['role'])}
                >
                  <SelectTrigger id='staff-role'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((item) => (
                      <SelectItem key={item} value={item}>
                        {formatRole(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='flex items-end'>
                <Button type='submit' disabled={busy}>
                  {busy ? 'Saving…' : 'Create account'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>
              Changes to roles, status and passwords invalidate existing
              sessions.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <QueryState
              loading={staff.isPending}
              error={staff.error}
              empty={staff.data?.staff.length === 0}
              onRetry={() => void staff.refetch()}
            />
            {staff.data?.staff.map((person) => (
              <div
                key={person.id}
                className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'
              >
                <div className='min-w-0'>
                  <p className='font-medium'>
                    {person.full_name}{' '}
                    <Badge variant='outline'>
                      {person.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    {person.email} · {formatRole(person.role)}
                    {person.must_change_password
                      ? ' · Password change required'
                      : ''}
                  </p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Select
                    value={person.role}
                    disabled={busy}
                    onValueChange={(value) =>
                      void change(person, { role: value as Staff['role'] })
                    }
                  >
                    <SelectTrigger
                      aria-label={`Role for ${person.full_name}`}
                      className='w-44'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((item) => (
                        <SelectItem key={item} value={item}>
                          {formatRole(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size='sm'
                    type='button'
                    variant='outline'
                    disabled={busy || !person.is_active}
                    onClick={() => void reset(person)}
                  >
                    Reset password
                  </Button>
                  <Button
                    size='sm'
                    type='button'
                    variant='outline'
                    disabled={busy}
                    onClick={() =>
                      void change(person, { isActive: !person.is_active })
                    }
                  >
                    {person.is_active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ChurchPage>
  )
}
