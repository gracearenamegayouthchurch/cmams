import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/cmams-api'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { type Person } from './types'

export function DirectoryPage() {
  const [search, setSearch] = useState('')
  const directory = useQuery({
    queryKey: ['people', search],
    queryFn: () =>
      api<{ people: Person[] }>(
        `/api/v1/people?q=${encodeURIComponent(search)}`
      ),
  })
  return (
    <ChurchPage
      title='People directory'
      description='One profile for each member and visitor. Contact details are masked where required.'
    >
      <div className='space-y-2'>
        <Label htmlFor='directory-search'>Search by name or member code</Label>
        <Input
          id='directory-search'
          className='max-w-lg'
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder='Search church records'
        />
      </div>
      <div className='mt-6'>
        <QueryState
          loading={directory.isPending}
          error={directory.error}
          empty={directory.data?.people.length === 0}
          onRetry={() => void directory.refetch()}
        />
        {directory.data && directory.data.people.length > 0 && (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {directory.data.people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className='font-mono text-xs'>
                      {person.member_code}
                    </TableCell>
                    <TableCell className='font-medium'>
                      {person.first_name} {person.last_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant='secondary'>
                        {person.lifecycle_stage.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{person.phone || 'Not provided'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </ChurchPage>
  )
}
