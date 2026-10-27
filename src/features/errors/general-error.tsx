import { useNavigate, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
}

export function GeneralError({
  className,
  minimal = false,
}: GeneralErrorProps) {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className={cn('h-svh w-full', className)}>
      <div className='m-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-2 px-4 text-center'>
        {!minimal && (
          <p className='text-sm font-semibold tracking-widest text-sky-600 uppercase dark:text-sky-400'>
            Error 500
          </p>
        )}
        <h1 className='text-2xl font-semibold tracking-tight'>
          Something went wrong
        </h1>
        <p className='text-sm text-muted-foreground'>
          An unexpected error occurred. Refresh the page or try again in a
          moment.
        </p>
        {!minimal && (
          <div className='mt-5 flex gap-3'>
            <Button variant='outline' onClick={() => history.go(-1)}>
              Go back
            </Button>
            <Button onClick={() => navigate({ to: '/' })}>Go to home</Button>
          </div>
        )}
      </div>
    </div>
  )
}
