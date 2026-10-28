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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'

type Kind = 'compounds' | 'departments'
type Entry = { id: string; name: string }
type Catalogs = Record<Kind, Entry[]>

export function CatalogsPage() {
  const queryClient = useQueryClient()
  const catalogs = useQuery({
    queryKey: ['registration-catalogs'],
    queryFn: () => api<Catalogs>('/api/v1/catalogs'),
  })
  const [names, setNames] = useState<Record<Kind, string>>({
    compounds: '',
    departments: '',
  })
  const [editing, setEditing] = useState<(Entry & { kind: Kind }) | null>(null)
  const [removing, setRemoving] = useState<(Entry & { kind: Kind }) | null>(
    null
  )
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: async ({
      kind,
      id,
      method,
      name,
    }: {
      kind: Kind
      id?: string
      method: 'POST' | 'PATCH' | 'DELETE'
      name?: string
    }) =>
      api(`/api/v1/catalogs/${kind}${id ? `/${id}` : ''}`, {
        method,
        ...(name !== undefined ? { body: JSON.stringify({ name }) } : {}),
      }),
    onSuccess: async () => {
      setError('')
      setEditing(null)
      setRemoving(null)
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

  function add(event: FormEvent, kind: Kind) {
    event.preventDefault()
    mutation.mutate(
      { kind, method: 'POST', name: names[kind] },
      { onSuccess: () => setNames((current) => ({ ...current, [kind]: '' })) }
    )
  }

  return (
    <ChurchPage
      title='Registration choices'
      description='Manage compounds and departments available at registration.'
    >
      {error && (
        <p role='alert' className='mb-4 text-sm text-destructive'>
          {error}
        </p>
      )}
      <QueryState
        loading={catalogs.isPending}
        error={catalogs.error}
        onRetry={() => void catalogs.refetch()}
      />
      <div className='grid gap-5 lg:grid-cols-2'>
        {(['compounds', 'departments'] as const).map((kind) => (
          <Card key={kind}>
            <CardHeader>
              <CardTitle className='capitalize'>{kind}</CardTitle>
              <CardDescription>
                Deactivating an option prevents new registrations but keeps
                existing records.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <form
                className='flex items-end gap-2'
                onSubmit={(event) => add(event, kind)}
              >
                <div className='flex-1 space-y-1.5'>
                  <Label htmlFor={`new-${kind}`}>
                    New {kind === 'compounds' ? 'compound' : 'department'} name
                  </Label>
                  <Input
                    id={`new-${kind}`}
                    required
                    maxLength={100}
                    value={names[kind]}
                    onChange={(event) =>
                      setNames((current) => ({
                        ...current,
                        [kind]: event.target.value,
                      }))
                    }
                  />
                </div>
                <Button type='submit' disabled={mutation.isPending}>
                  Add
                </Button>
              </form>
              <ul className='divide-y rounded-lg border'>
                {catalogs.data?.[kind].map((entry) => (
                  <li
                    className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
                    key={entry.id}
                  >
                    {editing?.id === entry.id && editing.kind === kind ? (
                      <form
                        className='flex flex-1 items-center gap-2'
                        onSubmit={(event) => {
                          event.preventDefault()
                          mutation.mutate({
                            kind,
                            id: entry.id,
                            method: 'PATCH',
                            name: editing.name,
                          })
                        }}
                      >
                        <Input
                          aria-label={`Rename ${entry.name}`}
                          required
                          maxLength={100}
                          value={editing.name}
                          onChange={(event) =>
                            setEditing({ ...editing, name: event.target.value })
                          }
                        />
                        <Button size='sm' disabled={mutation.isPending}>
                          Save
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => setEditing(null)}
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
                            onClick={() => setEditing({ ...entry, kind })}
                          >
                            Rename
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            onClick={() => setRemoving({ ...entry, kind })}
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
        ))}
      </div>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={removing ? `Deactivate ${removing.name}?` : 'Deactivate?'}
        desc='Existing member records will keep this value, but it will no longer be available at registration.'
        confirmText='Deactivate'
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (removing)
            mutation.mutate({
              kind: removing.kind,
              id: removing.id,
              method: 'DELETE',
            })
        }}
      />
    </ChurchPage>
  )
}
