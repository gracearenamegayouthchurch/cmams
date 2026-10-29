import { useState, type FormEvent } from 'react'
import { useNavigate, useRouter, useRouteContext } from '@tanstack/react-router'
import { api } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { homeForRole } from './access'
import { ChurchPage } from './pages'

export function ChangePasswordPage() {
  const { staff } = useRouteContext({ from: '/_authenticated' })
  const router = useRouter()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (next !== confirm) {
      setError('New passwords do not match.')
      return
    }
    if (next.length < 12) {
      setError('Use at least 12 characters.')
      return
    }
    setBusy(true)
    try {
      await api('/api/v1/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      setCurrent('')
      setNext('')
      setConfirm('')
      await router.invalidate()
      if (staff.must_complete_profile) {
        await navigate({ to: '/complete-profile' as '/' })
      } else {
        await navigate({ to: homeForRole[staff.role] as '/' })
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Password change failed. Try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <ChurchPage
      title='Change password'
      description={
        staff.must_change_password
          ? 'Set your own password before using CMAMS.'
          : 'Update your staff password.'
      }
    >
      <Card className='max-w-md'>
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            At least 12 characters. The new password must differ from your
            current one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void submit(event)} className='space-y-4'>
            <div className='space-y-1'>
              <Label htmlFor='current-password'>
                Current or temporary password
              </Label>
              <Input
                id='current-password'
                type='password'
                autoComplete='current-password'
                required
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='new-password'>New password</Label>
              <Input
                id='new-password'
                type='password'
                autoComplete='new-password'
                minLength={12}
                required
                value={next}
                onChange={(event) => setNext(event.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='confirm-password'>Confirm new password</Label>
              <Input
                id='confirm-password'
                type='password'
                autoComplete='new-password'
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            {error && (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            )}
            <Button disabled={busy} type='submit'>
              {busy ? 'Saving…' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </ChurchPage>
  )
}
