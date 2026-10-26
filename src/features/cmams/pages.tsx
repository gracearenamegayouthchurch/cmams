import { useNavigate } from '@tanstack/react-router'
import { api } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

export function ChurchPage({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <>
      <Header>
        <div className='ml-auto flex items-center gap-2'>
          <ThemeSwitch />
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={async () => {
              await api('/api/v1/logout', { method: 'POST', body: '{}' })
              await navigate({ to: '/login' })
            }}
          >
            Sign out
          </Button>
        </div>
      </Header>
      <Main>
        <div className='mb-8'>
          <h1 className='text-3xl font-semibold tracking-tight'>{title}</h1>
          <p className='mt-2 text-muted-foreground'>{description}</p>
        </div>
        {children}
      </Main>
    </>
  )
}
