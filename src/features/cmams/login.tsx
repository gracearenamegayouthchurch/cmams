import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
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
import { PasswordInput } from '@/components/password-input'
import { ThemeSwitch } from '@/components/theme-switch'
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
      await navigate({
        to: (staff.must_change_password
          ? '/change-password'
          : homeForRole[staff.role]) as '/',
      })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not sign in. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className='relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-12'>
      <img
        src='/images/church-bg.jpg'
        alt=''
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 size-full scale-105 object-cover object-center blur-[5px]'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/65 via-slate-950/60 to-slate-950/80'
      />
      <div className='absolute top-4 right-4 z-20 rounded-full bg-background/85 p-0.5 shadow-sm backdrop-blur-md'>
        <ThemeSwitch />
      </div>

      <div className='relative z-10 w-full max-w-[400px] space-y-6'>
        <div className='flex flex-col items-center text-center'>
          <img
            src='/images/grace-arena-logo.png'
            alt='Grace Arena Mega Youth Church'
            className='h-28 w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.65)]'
          />
        </div>

        <Card className='border-white/15 bg-card/95 shadow-2xl backdrop-blur-md'>
          <CardHeader className='space-y-1 pb-4 text-center'>
            <CardTitle className='text-xl font-semibold tracking-tight'>
              Staff sign in
            </CardTitle>
            <CardDescription>
              Use your staff email and password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className='space-y-4'>
              <div className='space-y-1.5'>
                <Label htmlFor='email'>Staff email</Label>
                <Input
                  id='email'
                  type='email'
                  required
                  placeholder='name@gracearena.org'
                  autoComplete='username'
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='password'>Password</Label>
                <PasswordInput
                  id='password'
                  required
                  placeholder='Enter your password'
                  autoComplete='current-password'
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {error && (
                <div
                  role='alert'
                  className='flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive'
                >
                  <AlertCircle
                    className='mt-0.5 size-4 shrink-0'
                    aria-hidden='true'
                  />
                  <span>{error}</span>
                </div>
              )}
              <Button type='submit' className='w-full' disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className='text-center text-xs text-slate-200/90 drop-shadow-xs'>
          Authorized church staff only. Need an account? Contact your service
          administrator.
        </p>
      </div>
    </main>
  )
}
