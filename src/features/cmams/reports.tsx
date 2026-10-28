import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { ServicePicker } from './service-picker'
import { type Service } from './types'

type Absentee = {
  id: string
  member_code: string
  first_name: string
  last_name: string
  phone_e164: string | null
  last_attended_at: string | null
}

export function ReportsPage() {
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })
  const serviceId = selectedServiceId || services.data?.services[0]?.id || ''

  const absentees = useQuery({
    queryKey: ['absentees', 2],
    queryFn: () => api<{ people: Absentee[] }>('/api/v1/reports/absentees'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  return (
    <ChurchPage
      title='Reports'
      description='Download service attendance records and pastoral follow-up lists.'
    >
      <div className='max-w-5xl space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>Service attendance</CardTitle>
            <CardDescription>
              Export a CSV of everyone checked in for a selected service.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <QueryState
              loading={services.isPending}
              error={services.error}
              empty={services.data?.services.length === 0}
              emptyTitle='No services yet'
              emptyDescription='Attendance exports become available once a service has been scheduled.'
              onRetry={() => void services.refetch()}
            />
            {services.data && services.data.services.length > 0 && (
              <div className='flex flex-wrap items-end gap-3'>
                <ServicePicker
                  services={services.data.services}
                  value={serviceId}
                  onChange={setSelectedServiceId}
                />
                <Button asChild={!!serviceId} disabled={!serviceId}>
                  {serviceId ? (
                    <a
                      href={`/api/v1/reports/attendance.csv?serviceId=${encodeURIComponent(serviceId)}`}
                      download
                    >
                      <Download className='size-4' />
                      Download attendance CSV
                    </a>
                  ) : (
                    'Select a service'
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <div className='flex items-center gap-2.5'>
                  <CardTitle>Missed last 2 Sundays</CardTitle>
                  {absentees.data && (
                    <Badge variant='secondary' className='tabular-nums'>
                      {absentees.data.people.length} for follow-up
                    </Badge>
                  )}
                </div>
                <CardDescription className='mt-1'>
                  Members and regular attendees absent from the last two
                  closed Sunday services.
                </CardDescription>
              </div>
              {absentees.data && absentees.data.people.length > 0 && (
                <Button variant='outline' size='sm' asChild>
                  <a href='/api/v1/reports/absentees.csv' download>
                    <Download className='size-4' />
                    Download follow-up CSV
                  </a>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <QueryState
              loading={absentees.isPending}
              error={absentees.error}
              empty={absentees.data?.people.length === 0}
              emptyTitle='No absentees to follow up'
              emptyDescription='Appears when members registered before the last two closed Sunday services miss both.'
              onRetry={() => void absentees.refetch()}
            />
            {absentees.data && absentees.data.people.length > 0 && (
              <div className='overflow-x-auto rounded-xl border'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/40'>
                      <TableHead className='w-32'>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className='text-right'>
                        Last attended
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absentees.data.people.map((person) => (
                      <TableRow key={person.id}>
                        <TableCell className='font-mono text-xs font-medium text-muted-foreground'>
                          {person.member_code}
                        </TableCell>
                        <TableCell className='font-medium'>
                          {person.first_name} {person.last_name}
                        </TableCell>
                        <TableCell className='tabular-nums'>
                          {person.phone_e164 ? (
                            <a
                              href={`tel:${person.phone_e164}`}
                              className='text-sky-700 hover:underline dark:text-sky-300'
                            >
                              {person.phone_e164}
                            </a>
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </TableCell>
                        <TableCell className='text-right text-muted-foreground tabular-nums'>
                          {person.last_attended_at
                            ? new Date(
                                person.last_attended_at
                              ).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'No prior check-in'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ChurchPage>
  )
}
