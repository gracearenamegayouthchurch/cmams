import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function LoginPage() {
  return <main className='flex min-h-dvh items-center justify-center bg-muted p-6'><Card className='w-full max-w-sm'><CardHeader><CardTitle>Grace Arena · Staff access</CardTitle></CardHeader><CardContent><p className='text-sm text-muted-foreground'>Staff authentication is being connected. Do not enter personal information until the secure church database is ready.</p></CardContent></Card></main>
}
