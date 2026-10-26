import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ChurchPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <><Header /><Main><div className='mb-8'><h1 className='text-3xl font-semibold tracking-tight'>{title}</h1><p className='mt-2 text-muted-foreground'>{description}</p></div>{children}</Main></>
}

function AwaitingBackend({ operation }: { operation: string }) {
  return <Card className='max-w-2xl border-sky-200 dark:border-sky-900'><CardHeader><CardTitle>Connect to church records</CardTitle></CardHeader><CardContent className='space-y-4'><p className='text-sm text-muted-foreground'>The {operation} workflow needs the protected church database and staff account. No attendance or member data will be fabricated while setup is incomplete.</p><Button disabled>Waiting for setup</Button></CardContent></Card>
}

export function DashboardPage() { return <ChurchPage title='Church overview' description='Attendance, services, and pastoral care at a glance.'><AwaitingBackend operation='dashboard' /></ChurchPage> }
export function ScanPage() { return <ChurchPage title='Check-in scanner' description='Welcome each person and record their arrival once.'><AwaitingBackend operation='scanner' /></ChurchPage> }
export function DeskPage() { return <ChurchPage title='Registration desk' description='Find a person before registering a new profile.'><AwaitingBackend operation='registration' /></ChurchPage> }
export function DirectoryPage() { return <ChurchPage title='People directory' description='One profile for every visitor and member.'><AwaitingBackend operation='directory' /></ChurchPage> }
export function ServicesPage() { return <ChurchPage title='Services' description='Schedule gatherings and manage check-in windows.'><AwaitingBackend operation='services' /></ChurchPage> }
export function CardsPage() { return <ChurchPage title='Member cards' description='Issue, download, and replace attendance credentials.'><AwaitingBackend operation='cards' /></ChurchPage> }
export function ReportsPage() { return <ChurchPage title='Reports' description='Attendance and pastoral follow-up without changing historical records.'><AwaitingBackend operation='reports' /></ChurchPage> }
