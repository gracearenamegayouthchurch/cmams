import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function ForbiddenError() {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-2 px-4 text-center'>
        <p className='text-sm font-semibold tracking-widest text-amber-600 uppercase dark:text-amber-400'>
          Error 403
        </p>
        <h1 className='text-2xl font-semibold tracking-tight'>
          Access restricted
        </h1>
        <p className='text-sm text-muted-foreground'>
          Your staff account does not have permission to open this page.
        </p>
        <div className='mt-5 flex gap-3'>
          <Button variant='outline' onClick={() => history.go(-1)}>
            Go back
          </Button>
          <Button onClick={() => navigate({ to: '/' })}>Go to home</Button>
        </div>
      </div>
    </div>
  )
}
