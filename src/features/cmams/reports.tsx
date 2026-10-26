import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const [serviceId, setServiceId] = useState('')
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })
  const absentees = useQuery({
    queryKey: ['absentees', 3],
    queryFn: () => api<{ people: Absentee[] }>('/api/v1/reports/absentees'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  return (
    <ChurchPage
      title='Reports'
      description='Review attendance and follow up with members who missed three closed Sunday services.'
    >
      <div className='space-y-8'>
        <Card>
          <CardHeader>
            <CardTitle>Attendance export</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <QueryState
              loading={services.isPending}
              error={services.error}
              onRetry={() => void services.refetch()}
            />
            {services.data && (
              <ServicePicker
                services={services.data.services}
                value={serviceId}
                onChange={setServiceId}
              />
            )}
            <Button
              asChild={!!serviceId}
              disabled={!serviceId}
              variant='outline'
            >
              {serviceId ? (
                <a
                  href={`/api/v1/reports/attendance.csv?serviceId=${encodeURIComponent(serviceId)}`}
                  download
                >
                  Download attendance CSV
                </a>
              ) : (
                'Select a service first'
              )}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pastoral care · three Sundays</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              Only people registered before the oldest of the three services
              appear here. Viewing or exporting contact details is audited.
            </p>
            <QueryState
              loading={absentees.isPending}
              error={absentees.error}
              onRetry={() => void absentees.refetch()}
            />
            {absentees.data && (
              <>
                <p className='text-sm font-medium'>
                  {absentees.data.people.length} people to follow up
                </p>
                <Button variant='outline' asChild>
                  <a href='/api/v1/reports/absentees.csv' download>
                    Download follow-up CSV
                  </a>
                </Button>
                {absentees.data.people.length > 0 && (
                  <div className='overflow-x-auto rounded-lg border'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Last attended</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {absentees.data.people.map((person) => (
                          <TableRow key={person.id}>
                            <TableCell className='font-mono text-xs'>
                              {person.member_code}
                            </TableCell>
                            <TableCell>
                              {person.first_name} {person.last_name}
                            </TableCell>
                            <TableCell>
                              {person.phone_e164 || 'Not provided'}
                            </TableCell>
                            <TableCell>
                              {person.last_attended_at
                                ? new Date(
                                    person.last_attended_at
                                  ).toLocaleDateString()
                                : 'Never'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ChurchPage>
  )
}
