import { ApiError } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function QueryState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean
  error: unknown
  empty?: boolean
  onRetry?: () => void
}) {
  if (loading)
    return (
      <div role='status' className='space-y-3'>
        <Skeleton className='h-12 w-full max-w-lg' />
        <Skeleton className='h-36 w-full' />
        <span className='sr-only'>Loading church records</span>
      </div>
    )
  if (error instanceof ApiError && error.status === 403) {
    return (
      <div
        role='alert'
        className='rounded-lg border border-amber-500/40 bg-amber-50/60 p-5 dark:bg-amber-950/30'
      >
        <p className='font-medium'>Access denied</p>
        <p className='mt-1 text-sm text-muted-foreground'>
          Your staff role does not have permission to view this section. Ask an
          administrator if you need access.
        </p>
      </div>
    )
  }
  if (error)
    return (
      <div role='alert' className='rounded-lg border border-destructive/30 p-5'>
        <p className='font-medium'>Church records are unavailable</p>
        <p className='mt-1 text-sm text-muted-foreground'>
          Your action has not been recorded. Check the connection and try again.
        </p>
        {onRetry && (
          <Button variant='outline' className='mt-3' onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    )
  if (empty)
    return (
      <p className='rounded-lg border border-dashed p-8 text-sm text-muted-foreground'>
        Nothing to show yet. Add a record to get started.
      </p>
    )
  return null
}
