import { useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { useOptionalSearch } from '@/context/search-provider'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

export function ChurchPage({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const search = useOptionalSearch()
  return (
    <>
      <Header
        fixed
        className='border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'
      >
        {search && <Search placeholder='Go to page…' />}
        <div className='ms-auto flex items-center gap-2'>
          <ThemeSwitch />
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='gap-1.5 text-muted-foreground hover:text-foreground'
            onClick={async () => {
              await api('/api/v1/logout', { method: 'POST', body: '{}' })
              await navigate({ to: '/login' })
            }}
          >
            <LogOut className='size-4' aria-hidden='true' />
            <span>Sign out</span>
          </Button>
        </div>
      </Header>
      <Main className='px-4 py-6 sm:px-6 lg:px-8'>
        <div className='mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-5'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
              {title}
            </h1>
            <p className='text-sm text-muted-foreground'>{description}</p>
          </div>
          {actions && (
            <div className='flex flex-wrap items-center gap-2'>{actions}</div>
          )}
        </div>
        {children}
      </Main>
    </>
  )
}
