import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function UnauthorisedError() {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-2 px-4 text-center'>
        <p className='text-sm font-semibold tracking-widest text-sky-600 uppercase dark:text-sky-400'>
          Error 401
        </p>
        <h1 className='text-2xl font-semibold tracking-tight'>
          Sign-in required
        </h1>
        <p className='text-sm text-muted-foreground'>
          Sign in with your staff account to view this page.
        </p>
        <div className='mt-5 flex gap-3'>
          <Button variant='outline' onClick={() => history.go(-1)}>
            Go back
          </Button>
          <Button onClick={() => navigate({ to: '/login' })}>Sign in</Button>
        </div>
      </div>
    </div>
  )
}
