import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ScanLine } from 'lucide-react'
import { api, type Staff } from '@/lib/cmams-api'
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
import { homeForRole } from './access'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { staff } = await api<{ staff: Staff }>('/api/v1/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      await navigate({ to: homeForRole[staff.role] as '/' })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not sign in. Try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className='flex min-h-dvh items-center justify-center bg-muted/50 px-4 py-10'>
      <Card className='w-full max-w-md shadow-sm'>
        <CardHeader className='space-y-4'>
          <div className='flex size-12 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'>
            <ScanLine aria-hidden='true' />
          </div>
          <div>
            <CardTitle className='text-2xl'>Welcome back</CardTitle>
            <CardDescription className='mt-2'>
              Grace Arena · Member & attendance management
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className='space-y-5'>
            <div className='space-y-2'>
              <Label htmlFor='email'>Staff email</Label>
              <Input
                id='email'
                type='email'
                required
                autoComplete='username'
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='password'>Password</Label>
              <Input
                id='password'
                type='password'
                required
                autoComplete='current-password'
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error && (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            )}
            <Button type='submit' className='w-full' disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
