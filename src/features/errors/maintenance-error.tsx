export function MaintenanceError() {
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-2 px-4 text-center'>
        <p className='text-sm font-semibold tracking-widest text-sky-600 uppercase dark:text-sky-400'>
          Status 503
        </p>
        <h1 className='text-2xl font-semibold tracking-tight'>
          Temporarily unavailable
        </h1>
        <p className='text-sm text-muted-foreground'>
          Scheduled maintenance is in progress. Please check back in a few
          minutes.
        </p>
      </div>
    </div>
  )
}
