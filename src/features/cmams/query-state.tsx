import { AlertCircle, Inbox, ShieldAlert } from 'lucide-react'
import { ApiError } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function QueryState({
  loading,
  error,
  empty,
  emptyTitle = 'No records yet',
  emptyDescription = 'Records will appear here once added.',
  onRetry,
}: {
  loading: boolean
  error: unknown
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onRetry?: () => void
}) {
  if (loading)
    return (
      <div role='status' className='space-y-3'>
        <Skeleton className='h-11 w-full max-w-md rounded-lg' />
        <Skeleton className='h-36 w-full rounded-xl' />
        <span className='sr-only'>Loading</span>
      </div>
    )
  if (error instanceof ApiError && error.status === 403) {
    return (
      <div
        role='alert'
        className='flex items-start gap-3.5 rounded-xl border border-amber-500/35 bg-amber-50/70 p-4 text-sm dark:bg-amber-950/30'
      >
        <ShieldAlert
          className='mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400'
          aria-hidden='true'
        />
        <div>
          <p className='font-medium text-foreground'>Access denied</p>
          <p className='mt-0.5 text-muted-foreground'>
            Your account does not have permission to view this page. Contact an
            administrator if you need access.
          </p>
        </div>
      </div>
    )
  }
  if (error)
    return (
      <div
        role='alert'
        className='flex items-start gap-3.5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm'
      >
        <AlertCircle
          className='mt-0.5 size-5 shrink-0 text-destructive'
          aria-hidden='true'
        />
        <div className='space-y-2.5'>
          <div>
            <p className='font-medium text-foreground'>Could not load data</p>
            <p className='mt-0.5 text-muted-foreground'>
              Check your internet connection and try again.
            </p>
          </div>
          {onRetry && (
            <Button variant='outline' size='sm' onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    )
  if (empty)
    return (
      <div className='flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center'>
        <Inbox className='size-8 text-muted-foreground/70' aria-hidden='true' />
        <p className='mt-3 text-sm font-medium text-foreground'>{emptyTitle}</p>
        <p className='mt-1 max-w-sm text-xs text-muted-foreground'>
          {emptyDescription}
        </p>
      </div>
    )
  return null
}
