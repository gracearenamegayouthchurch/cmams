import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Search } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatDateTime,
  formatServiceStatus,
  serviceStatusClass,
} from './format'
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
  cell_name?: string | null
  last_attended_at: string | null
}

export function ReportsPage() {
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [missedCount, setMissedCount] = useState('2')
  const [absenteeFilter, setAbsenteeFilter] = useState('')
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api<{ services: Service[] }>('/api/v1/services'),
  })
  const serviceId = selectedServiceId || services.data?.services[0]?.id || ''
  const selectedService = services.data?.services.find(
    (item) => item.id === serviceId
  )

  const absentees = useQuery({
    queryKey: ['absentees', missedCount],
    queryFn: () =>
      api<{ people: Absentee[] }>(
        `/api/v1/reports/absentees?count=${encodeURIComponent(missedCount)}`
      ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const needle = absenteeFilter.trim().toLowerCase()
  const filteredAbsentees = (absentees.data?.people ?? []).filter((person) => {
    if (!needle) return true
    const fullName = `${person.first_name} ${person.last_name}`.toLowerCase()
    return (
      fullName.includes(needle) ||
      person.member_code.toLowerCase().includes(needle) ||
      (person.cell_name ?? '').toLowerCase().includes(needle) ||
      (person.phone_e164 ?? '').toLowerCase().includes(needle)
    )
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
              <div className='space-y-3'>
                <div className='flex flex-wrap items-end justify-between gap-3'>
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
                {selectedService && (
                  <div className='flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground'>
                    <Badge
                      variant='outline'
                      className={serviceStatusClass(selectedService.status)}
                    >
                      {formatServiceStatus(selectedService.status)}
                    </Badge>
                    <span>
                      {formatDateTime(selectedService.scheduled_start_at)}
                    </span>
                    {selectedService.attendance_count !== undefined && (
                      <span className='tabular-nums'>
                        ·{' '}
                        {selectedService.attendance_count === 0
                          ? 'No check-ins recorded yet'
                          : `${selectedService.attendance_count} ${
                              selectedService.attendance_count === 1
                                ? 'person'
                                : 'people'
                            } checked in`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <div className='flex flex-wrap items-center gap-2.5'>
                  <CardTitle>
                    Missed last {missedCount}{' '}
                    {missedCount === '1' ? 'Sunday' : 'Sundays'}
                  </CardTitle>
                  {absentees.data && (
                    <Badge variant='secondary' className='tabular-nums'>
                      {absentees.data.people.length} for follow-up
                    </Badge>
                  )}
                </div>
                <CardDescription className='mt-1'>
                  Members and regular attendees absent from the last{' '}
                  {missedCount === '1'
                    ? 'closed Sunday service'
                    : `${missedCount} closed Sunday services`}
                  .
                </CardDescription>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Select value={missedCount} onValueChange={setMissedCount}>
                  <SelectTrigger
                    aria-label='Consecutive missed Sundays'
                    size='sm'
                    className='w-[150px]'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='1'>Last 1 Sunday</SelectItem>
                    <SelectItem value='2'>Last 2 Sundays</SelectItem>
                    <SelectItem value='3'>Last 3 Sundays</SelectItem>
                    <SelectItem value='4'>Last 4 Sundays</SelectItem>
                  </SelectContent>
                </Select>
                {absentees.data && absentees.data.people.length > 0 && (
                  <Button variant='outline' size='sm' asChild>
                    <a
                      href={`/api/v1/reports/absentees.csv?count=${encodeURIComponent(missedCount)}`}
                      download
                    >
                      <Download className='size-4' />
                      Download follow-up CSV
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <QueryState
              loading={absentees.isPending}
              error={absentees.error}
              empty={absentees.data?.people.length === 0}
              emptyTitle='No absentees to follow up'
              emptyDescription={`Appears when members registered before the last ${
                missedCount === '1'
                  ? 'closed Sunday service miss it'
                  : `${missedCount} closed Sunday services miss all ${missedCount}`
              }.`}
              onRetry={() => void absentees.refetch()}
            />
            {absentees.data && absentees.data.people.length > 0 && (
              <>
                <div className='relative max-w-xs'>
                  <Search
                    className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground'
                    aria-hidden='true'
                  />
                  <Input
                    aria-label='Filter follow-up list'
                    placeholder='Filter name, code, or cell'
                    value={absenteeFilter}
                    onChange={(event) => setAbsenteeFilter(event.target.value)}
                    className='h-8 pl-8 text-xs'
                  />
                </div>
                {filteredAbsentees.length === 0 ? (
                  <QueryState
                    loading={false}
                    error={null}
                    empty
                    emptyTitle='No matching members'
                    emptyDescription='Try clearing or adjusting your search filter.'
                  />
                ) : (
                  <div className='overflow-x-auto rounded-xl border'>
                    <Table>
                      <TableHeader>
                        <TableRow className='bg-muted/40'>
                          <TableHead className='w-28'>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Cell</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead className='text-right'>
                            Last attended
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAbsentees.map((person) => (
                          <TableRow key={person.id}>
                            <TableCell className='font-mono text-xs font-medium text-muted-foreground'>
                              {person.member_code}
                            </TableCell>
                            <TableCell className='font-medium'>
                              {person.first_name} {person.last_name}
                            </TableCell>
                            <TableCell className='text-muted-foreground'>
                              {person.cell_name ?? '—'}
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ChurchPage>
  )
}
