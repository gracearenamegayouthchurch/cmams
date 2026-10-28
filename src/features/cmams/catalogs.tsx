import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'

type Region = { code: string; label: string }
type Compound = {
  id: string
  name: string
  region: string
  is_active: boolean
  member_count: number
}
type Department = { id: string; name: string }
type Cell = {
  id: string
  name: string
  meeting_location: string
  region: string
  is_active: boolean
}
type Catalogs = {
  compounds: Compound[]
  departments: Department[]
  regions: Region[]
}
type MutationInput = {
  path: string
  method: 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

export function CatalogsPage() {
  const queryClient = useQueryClient()
  const catalogs = useQuery({
    queryKey: ['registration-catalogs'],
    queryFn: () => api<Catalogs>('/api/v1/catalogs'),
  })
  const cells = useQuery({
    queryKey: ['cells'],
    queryFn: () => api<{ cells: Cell[] }>('/api/v1/cells'),
  })
  const [departmentName, setDepartmentName] = useState('')
  const [editingCompound, setEditingCompound] = useState<Compound | null>(null)
  const [compoundName, setCompoundName] = useState('')
  const [compoundRegion, setCompoundRegion] = useState('')
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(
    null
  )
  const [departmentEditName, setDepartmentEditName] = useState('')
  const [removing, setRemoving] = useState<{
    kind: 'compound' | 'department'
    id: string
    name: string
  } | null>(null)
  const [merging, setMerging] = useState<Compound | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: ({ path, method, body }: MutationInput) =>
      api(path, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    onMutate: () => setError(''),
    onSuccess: async () => {
      setError('')
      setRemoving(null)
      setMerging(null)
      setMergeTarget('')
      await queryClient.invalidateQueries({
        queryKey: ['registration-catalogs'],
      })
    },
    onError: (reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not update registration choices'
      ),
  })

  function addDepartment(event: FormEvent) {
    event.preventDefault()
    mutation.mutate(
      {
        path: '/api/v1/catalogs/departments',
        method: 'POST',
        body: { name: departmentName },
      },
      { onSuccess: () => setDepartmentName('') }
    )
  }

  const groups = (catalogs.data?.regions ?? []).map((region) => ({
    ...region,
    compounds: (catalogs.data?.compounds ?? []).filter(
      (item) => item.region === region.code
    ),
    cells: (cells.data?.cells ?? []).filter(
      (item) => item.region === region.code
    ),
  }))
  const regionLabel = (code: string) =>
    catalogs.data?.regions.find((item) => item.code === code)?.label ?? code

  return (
    <ChurchPage
      title='Registration choices'
      description='Compounds are created at registration. Merge duplicates and manage departments here.'
    >
      {error && (
        <p role='alert' className='mb-4 text-sm text-destructive'>
          {error}
        </p>
      )}
      <QueryState
        loading={catalogs.isPending || cells.isPending}
        error={catalogs.error || cells.error}
        onRetry={() => {
          void catalogs.refetch()
          void cells.refetch()
        }}
      />
      <Card className='mb-5'>
        <CardHeader>
          <CardTitle>Compounds by region</CardTitle>
          <CardDescription>
            Every compound entered at registration is saved automatically under
            its region. Rename, move, merge duplicates, or deactivate one here.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          {groups.map((group) => (
            <section key={group.code} className='space-y-2'>
              <div className='flex items-baseline justify-between gap-3'>
                <h3 className='text-sm font-semibold'>{group.label}</h3>
                <span className='text-xs text-muted-foreground'>
                  {group.compounds.length} compound
                  {group.compounds.length === 1 ? '' : 's'}
                </span>
              </div>
              {group.compounds.length === 0 && (
                <p className='rounded-lg border border-dashed p-3 text-sm text-muted-foreground'>
                  No compounds saved under {group.label} yet.
                </p>
              )}
              <ul className='divide-y rounded-lg border'>
                {group.compounds.map((entry) => (
                  <li
                    className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
                    key={entry.id}
                  >
                    {editingCompound?.id === entry.id ? (
                      <form
                        className='flex flex-1 flex-wrap items-end gap-2'
                        onSubmit={(event) => {
                          event.preventDefault()
                          mutation.mutate(
                            {
                              path: `/api/v1/catalogs/compounds/${entry.id}`,
                              method: 'PATCH',
                              body: {
                                name: compoundName,
                                region: compoundRegion,
                              },
                            },
                            { onSuccess: () => setEditingCompound(null) }
                          )
                        }}
                      >
                        <div className='min-w-40 flex-1 space-y-1'>
                          <Label htmlFor={`compound-name-${entry.id}`}>
                            Compound name
                          </Label>
                          <Input
                            id={`compound-name-${entry.id}`}
                            required
                            maxLength={100}
                            value={compoundName}
                            onChange={(event) =>
                              setCompoundName(event.target.value)
                            }
                          />
                        </div>
                        <div className='w-40 space-y-1'>
                          <Label htmlFor={`compound-region-${entry.id}`}>
                            Region
                          </Label>
                          <Select
                            value={compoundRegion}
                            onValueChange={setCompoundRegion}
                          >
                            <SelectTrigger
                              id={`compound-region-${entry.id}`}
                              className='w-full'
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(catalogs.data?.regions ?? []).map((region) => (
                                <SelectItem
                                  key={region.code}
                                  value={region.code}
                                >
                                  {region.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size='sm' disabled={mutation.isPending}>
                          Save
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => setEditingCompound(null)}
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <>
                        <div>
                          <p className='text-sm'>{entry.name}</p>
                          <p className='text-xs text-muted-foreground'>
                            {entry.member_count} member
                            {entry.member_count === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className='flex flex-wrap gap-2'>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            onClick={() => {
                              setError('')
                              setEditingCompound(entry)
                              setCompoundName(entry.name)
                              setCompoundRegion(entry.region)
                            }}
                          >
                            Rename / move
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            onClick={() => {
                              setError('')
                              setMerging(entry)
                              setMergeTarget('')
                            }}
                          >
                            Merge
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            onClick={() => {
                              setError('')
                              setRemoving({
                                kind: 'compound',
                                id: entry.id,
                                name: entry.name,
                              })
                            }}
                          >
                            Deactivate
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </CardContent>
      </Card>

      <Card className='mb-5'>
        <CardHeader>
          <CardTitle>Cells by region</CardTitle>
          <CardDescription>
            Saturday fellowship groups nested under their region. Manage names,
            meeting places, leaders, and members on the Cells page.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          {groups.map((group) => (
            <section key={group.code} className='space-y-2'>
              <div className='flex items-baseline justify-between gap-3'>
                <h3 className='text-sm font-semibold'>{group.label}</h3>
                <span className='text-xs text-muted-foreground'>
                  {group.cells.length} cell
                  {group.cells.length === 1 ? '' : 's'}
                </span>
              </div>
              {group.cells.length === 0 ? (
                <p className='rounded-lg border border-dashed p-3 text-sm text-muted-foreground'>
                  No cells under {group.label} yet.
                </p>
              ) : (
                <ul className='divide-y rounded-lg border'>
                  {group.cells.map((cell) => (
                    <li
                      className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
                      key={cell.id}
                    >
                      <span className='text-sm'>
                        {cell.name}
                        {cell.is_active ? '' : ' (archived)'}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {cell.meeting_location}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
          <CardDescription>
            Deactivating a department prevents new registrations but keeps
            existing records.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <form className='flex items-end gap-2' onSubmit={addDepartment}>
            <div className='flex-1 space-y-1.5'>
              <Label htmlFor='new-department'>New department name</Label>
              <Input
                id='new-department'
                required
                maxLength={100}
                value={departmentName}
                onChange={(event) => setDepartmentName(event.target.value)}
              />
            </div>
            <Button type='submit' disabled={mutation.isPending}>
              Add
            </Button>
          </form>
          <ul className='divide-y rounded-lg border'>
            {(catalogs.data?.departments ?? []).map((entry) => (
              <li
                className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
                key={entry.id}
              >
                {editingDepartment?.id === entry.id ? (
                  <form
                    className='flex flex-1 items-center gap-2'
                    onSubmit={(event) => {
                      event.preventDefault()
                      mutation.mutate(
                        {
                          path: `/api/v1/catalogs/departments/${entry.id}`,
                          method: 'PATCH',
                          body: { name: departmentEditName },
                        },
                        { onSuccess: () => setEditingDepartment(null) }
                      )
                    }}
                  >
                    <Input
                      aria-label={`Rename ${entry.name}`}
                      required
                      maxLength={100}
                      value={departmentEditName}
                      onChange={(event) =>
                        setDepartmentEditName(event.target.value)
                      }
                    />
                    <Button size='sm' disabled={mutation.isPending}>
                      Save
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => setEditingDepartment(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className='text-sm'>{entry.name}</span>
                    <div className='flex gap-2'>
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          setEditingDepartment(entry)
                          setDepartmentEditName(entry.name)
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          setError('')
                          setRemoving({
                            kind: 'department',
                            id: entry.id,
                            name: entry.name,
                          })
                        }}
                      >
                        Deactivate
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!merging}
        onOpenChange={(open) => {
          if (!open) setMerging(null)
        }}
        title={merging ? `Merge ${merging.name}?` : 'Merge compound?'}
        desc='Current members and attendance snapshots move to the compound you choose. The merged compound is then deactivated.'
        confirmText='Merge compound'
        disabled={!mergeTarget}
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (merging && mergeTarget)
            mutation.mutate({
              path: `/api/v1/catalogs/compounds/${merging.id}/merge`,
              method: 'POST',
              body: { intoId: mergeTarget },
            })
        }}
      >
        <div className='space-y-1.5'>
          <Label htmlFor='merge-target'>Merge into</Label>
          <Select value={mergeTarget} onValueChange={setMergeTarget}>
            <SelectTrigger id='merge-target' className='w-full'>
              <SelectValue placeholder='Choose the compound to keep' />
            </SelectTrigger>
            <SelectContent>
              {(catalogs.data?.compounds ?? [])
                .filter((item) => item.id !== merging?.id)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({regionLabel(item.region)})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {error && (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={
          removing
            ? `Deactivate ${removing.name}?`
            : 'Deactivate registration choice?'
        }
        desc='Existing member records will keep this value. If someone enters this name again at registration, it will be reactivated automatically.'
        confirmText='Deactivate'
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (!removing) return
          mutation.mutate({
            path: `/api/v1/catalogs/${removing.kind === 'compound' ? 'compounds' : 'departments'}/${removing.id}`,
            method: 'DELETE',
          })
        }}
      >
        {error && (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )}
      </ConfirmDialog>
    </ChurchPage>
  )
}
