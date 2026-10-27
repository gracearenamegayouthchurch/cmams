import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
  Search,
  X,
} from 'lucide-react'
import { api } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatCategory,
  formatCheckinMethod,
  formatDateTime,
  formatStage,
  stageBadgeClass,
} from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import {
  type PaginatedPeople,
  type Person,
  type PersonAttendanceRecord,
} from './types'

const stageFilters = [
  { value: '', label: 'All' },
  { value: 'MEMBER', label: 'Members' },
  { value: 'REGULAR_ATTENDEE', label: 'Regular attendees' },
  { value: 'RETURNING_VISITOR', label: 'Returning visitors' },
  { value: 'FIRST_TIMER', label: 'First-timers' },
] as const

const pageSize = 15

export function DirectoryPage() {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  const [page, setPage] = useState(1)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)

  const directory = useQuery({
    queryKey: ['people', search, stage, page],
    queryFn: () =>
      api<PaginatedPeople>(
        `/api/v1/people?q=${encodeURIComponent(search)}&stage=${encodeURIComponent(stage)}&page=${page}&pageSize=${pageSize}`
      ),
  })

  const attendanceDetail = useQuery({
    queryKey: ['person-attendance', selectedPerson?.id],
    queryFn: () =>
      api<{ person: Person; history: PersonAttendanceRecord[] }>(
        `/api/v1/people/${selectedPerson?.id}/attendance`
      ),
    enabled: !!selectedPerson,
  })

  const people = directory.data?.people ?? []
  const total = directory.data?.total ?? people.length
  const totalPages = directory.data?.totalPages ?? 1
  const currentPage = directory.data?.page ?? page
  const startRow = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endRow = Math.min(total, (currentPage - 1) * pageSize + people.length)
  const history = attendanceDetail.data?.history ?? []
  const detailPerson = attendanceDetail.data?.person ?? selectedPerson

  return (
    <ChurchPage
      title='Members'
      description='Browse church members and visitors, filter by stage, and select any person to view their attendance history.'
    >
      <div className='space-y-4'>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div className='w-full max-w-md space-y-1.5'>
            <Label htmlFor='directory-search'>
              Search by name or member code
            </Label>
            <div className='relative'>
              <Search
                className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                aria-hidden='true'
              />
              <Input
                id='directory-search'
                className='pr-9 pl-9'
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder='Name or code (e.g. Ada or CM-1001)'
              />
              {search && (
                <button
                  type='button'
                  onClick={() => {
                    setSearch('')
                    setPage(1)
                  }}
                  aria-label='Clear search'
                  className='absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground'
                >
                  <X className='size-4' />
                </button>
              )}
            </div>
          </div>

          <div
            role='group'
            aria-label='Filter by stage'
            className='flex flex-wrap items-center gap-1.5'
          >
            {stageFilters.map((filter) => {
              const active = stage === filter.value
              return (
                <Button
                  key={filter.value || 'all'}
                  type='button'
                  size='sm'
                  variant={active ? 'default' : 'outline'}
                  onClick={() => {
                    setStage(filter.value)
                    setPage(1)
                  }}
                >
                  {filter.label}
                </Button>
              )
            })}
          </div>
        </div>

        <QueryState
          loading={directory.isPending}
          error={directory.error}
          empty={people.length === 0}
          emptyTitle={
            search.trim() || stage
              ? 'No matching profiles'
              : 'No profiles registered'
          }
          emptyDescription={
            search.trim() || stage
              ? 'Adjust your search or stage filter, or register a new profile at the Registration desk.'
              : 'Profiles added at the Registration desk will appear here.'
          }
          onRetry={() => void directory.refetch()}
        />

        {directory.data && people.length > 0 && (
          <Card className='overflow-hidden py-0'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead className='w-28'>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Attended</TableHead>
                  <TableHead>Last check-in</TableHead>
                  <TableHead className='text-right'>History</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => {
                  const isSelected = selectedPerson?.id === person.id
                  return (
                    <TableRow
                      key={person.id}
                      onClick={() => setSelectedPerson(person)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-sky-50/70 dark:bg-sky-950/30' : ''
                      }`}
                    >
                      <TableCell className='font-mono text-xs font-medium text-muted-foreground'>
                        {person.member_code}
                      </TableCell>
                      <TableCell className='font-medium'>
                        {person.first_name} {person.last_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant='outline'
                          className={stageBadgeClass(person.lifecycle_stage)}
                        >
                          {formatStage(person.lifecycle_stage)}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-muted-foreground tabular-nums'>
                        {person.phone || '—'}
                      </TableCell>
                      <TableCell className='tabular-nums'>
                        {typeof person.attendance_count === 'number'
                          ? `${person.attendance_count} ${person.attendance_count === 1 ? 'service' : 'services'}`
                          : '—'}
                      </TableCell>
                      <TableCell className='text-muted-foreground tabular-nums'>
                        {person.last_attended_at
                          ? new Date(
                              person.last_attended_at
                            ).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'Never'}
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedPerson(person)
                          }}
                        >
                          View history
                          <ChevronRight className='size-4' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className='flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground'>
              <span className='tabular-nums'>
                Showing {startRow}–{endRow} of {total}{' '}
                {total === 1 ? 'person' : 'people'}
              </span>
              <div className='flex items-center gap-2'>
                <span className='tabular-nums'>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={currentPage <= 1 || directory.isFetching}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className='size-4' />
                  Previous
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={currentPage >= totalPages || directory.isFetching}
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages, prev + 1))
                  }
                >
                  Next
                  <ChevronRight className='size-4' />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Sheet
        open={!!selectedPerson}
        onOpenChange={(open) => {
          if (!open) setSelectedPerson(null)
        }}
      >
        <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
          {detailPerson && (
            <>
              <SheetHeader className='border-b pb-4'>
                <div className='flex flex-wrap items-center gap-2 pr-6'>
                  <SheetTitle className='text-lg'>
                    {detailPerson.first_name} {detailPerson.last_name}
                  </SheetTitle>
                  <Badge variant='outline' className='font-mono'>
                    {detailPerson.member_code}
                  </Badge>
                  <Badge
                    variant='outline'
                    className={stageBadgeClass(detailPerson.lifecycle_stage)}
                  >
                    {formatStage(detailPerson.lifecycle_stage)}
                  </Badge>
                </div>
                <SheetDescription className='flex flex-wrap items-center gap-3 pt-1 text-xs'>
                  {detailPerson.phone && (
                    <span className='inline-flex items-center gap-1 tabular-nums'>
                      <Phone className='size-3' aria-hidden='true' />
                      {detailPerson.phone}
                    </span>
                  )}
                  {detailPerson.registered_at && (
                    <span>
                      Registered{' '}
                      {new Date(detailPerson.registered_at).toLocaleDateString(
                        undefined,
                        {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }
                      )}
                    </span>
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className='space-y-5 p-4 pt-2'>
                <div className='grid grid-cols-2 gap-3'>
                  <div className='rounded-xl border bg-muted/30 p-3'>
                    <p className='text-xs text-muted-foreground'>
                      Services attended
                    </p>
                    <p className='mt-1 text-2xl font-semibold tabular-nums'>
                      {attendanceDetail.data
                        ? history.length
                        : (detailPerson.attendance_count ?? '—')}
                    </p>
                  </div>
                  <div className='rounded-xl border bg-muted/30 p-3'>
                    <p className='text-xs text-muted-foreground'>
                      Last check-in
                    </p>
                    <p className='mt-1 text-sm font-medium tabular-nums'>
                      {history[0]
                        ? new Date(history[0].checked_in_at).toLocaleDateString(
                            undefined,
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }
                          )
                        : 'No check-ins'}
                    </p>
                  </div>
                </div>

                <div className='space-y-3'>
                  <h3 className='text-sm font-semibold'>Attendance history</h3>
                  <QueryState
                    loading={attendanceDetail.isPending}
                    error={attendanceDetail.error}
                    empty={
                      !!attendanceDetail.data &&
                      attendanceDetail.data.history.length === 0
                    }
                    emptyTitle='No attendance recorded yet'
                    emptyDescription='Check-ins for this person will appear here after they attend a service.'
                    onRetry={() => void attendanceDetail.refetch()}
                  />

                  {history.length > 0 && (
                    <div className='divide-y rounded-xl border'>
                      {history.map((item) => (
                        <div
                          key={item.id}
                          className='flex items-start justify-between gap-3 p-3.5 text-sm'
                        >
                          <div className='space-y-1'>
                            <div className='flex items-center gap-2 font-medium'>
                              <CalendarCheck
                                className='size-4 shrink-0 text-sky-600 dark:text-sky-400'
                                aria-hidden='true'
                              />
                              <span>{item.service_name}</span>
                            </div>
                            <p className='text-xs text-muted-foreground'>
                              {formatCategory(item.service_category)} ·{' '}
                              {new Date(
                                item.scheduled_start_at
                              ).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                          <div className='shrink-0 text-right'>
                            <Badge variant='secondary' className='text-xs'>
                              {formatCheckinMethod(item.checkin_method)}
                            </Badge>
                            <p className='mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground tabular-nums'>
                              <Clock className='size-3' aria-hidden='true' />
                              {formatDateTime(item.checked_in_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </ChurchPage>
  )
}
