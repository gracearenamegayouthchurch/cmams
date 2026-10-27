import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard,
  Download,
  FileText,
  RefreshCw,
  Search,
  ShieldX,
} from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  downloadBlob,
  downloadDataUrl,
  renderCardPdf,
  renderCardPng,
} from './card-render'
import { formatStage, stageBadgeClass } from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { type IssuedCard, type Person } from './types'
import { useDebouncedValue } from './use-debounced-value'

type ActiveCard = {
  id: string
  short_code: string
  person_id: string
  member_code: string
  first_name: string
  last_name: string
  issued_at?: string
}

export function CardDownloads({ card }: { card: IssuedCard }) {
  const [preview, setPreview] = useState('')
  const [renderError, setRenderError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    let active = true
    renderCardPng(card)
      .then((dataUrl) => {
        if (active) setPreview(dataUrl)
      })
      .catch(() => {
        if (active) setRenderError('Could not render the card in this browser.')
      })
    return () => {
      active = false
    }
  }, [card])

  async function downloadPdf() {
    setPdfBusy(true)
    setRenderError('')
    try {
      const bytes = await renderCardPdf(card)
      downloadBlob(
        new Blob([Uint8Array.from(bytes).buffer], {
          type: 'application/pdf',
        }),
        `${card.memberCode}.pdf`
      )
    } catch {
      setRenderError('Could not prepare the printable PDF. Try again.')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <Card className='border-sky-500/45 bg-sky-50/30 dark:bg-sky-950/20'>
      <CardHeader className='pb-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle className='text-base'>
            Card ready · {card.memberCode}
          </CardTitle>
          <Badge variant='outline' className='font-mono'>
            {card.shortCode}
          </Badge>
        </div>
        <CardDescription>
          Save the image or print PDF now. For security, this QR code is shown
          only once—if a card is lost, issue a replacement.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {preview ? (
          <img
            src={preview}
            alt={`Attendance card for ${card.memberCode}`}
            className='w-48 rounded-lg border bg-white shadow-xs'
          />
        ) : (
          <div className='flex h-60 w-48 items-center justify-center rounded-lg border bg-background p-3 text-center text-sm text-muted-foreground'>
            Preparing card…
          </div>
        )}
        <div className='flex flex-wrap gap-2.5'>
          <Button
            type='button'
            size='sm'
            disabled={!preview}
            onClick={() => downloadDataUrl(preview, `${card.memberCode}.png`)}
          >
            <Download className='size-4' />
            Download PNG
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={!preview || pdfBusy}
            onClick={() => void downloadPdf()}
          >
            <FileText className='size-4' />
            {pdfBusy ? 'Preparing PDF…' : 'Download printable PDF'}
          </Button>
        </div>
        {renderError && (
          <p role='alert' className='text-sm text-destructive'>
            {renderError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function CardsPage() {
  const queryClient = useQueryClient()
  const [personSearch, setPersonSearch] = useState('')
  const [search, setSearch] = useState('')
  const [issued, setIssued] = useState<IssuedCard | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ActiveCard | null>(null)

  const trimmedPersonSearch = personSearch.trim()
  const debouncedPersonSearch = useDebouncedValue(trimmedPersonSearch)
  const debouncedCardSearch = useDebouncedValue(search)
  const matchingPeople = useQuery({
    queryKey: ['people', 'card-issue', debouncedPersonSearch],
    queryFn: () =>
      api<{ people: Person[] }>(
        `/api/v1/people?q=${encodeURIComponent(debouncedPersonSearch)}`
      ),
    enabled: debouncedPersonSearch.length >= 2,
  })

  const cards = useQuery({
    queryKey: ['cards', debouncedCardSearch],
    queryFn: () =>
      api<{ cards: ActiveCard[] }>(
        `/api/v1/cards?q=${encodeURIComponent(debouncedCardSearch)}`
      ),
  })

  const issue = useMutation({
    mutationFn: (id: string) =>
      api<{ card: IssuedCard }>(`/api/v1/people/${id}/cards`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: async ({ card }) => {
      setIssued(card)
      setPersonSearch('')
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/cards/${id}/revoke`, { method: 'POST', body: '{}' }),
    onSuccess: async () => {
      setIssued(null)
      setRevokeTarget(null)
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
  })

  const mutationError = issue.error || revoke.error

  return (
    <ChurchPage
      title='Member cards'
      description='Issue new check-in cards, replace lost cards, or deactivate old ones.'
    >
      <div className='max-w-4xl space-y-6'>
        {mutationError && (
          <div
            role='alert'
            className='rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive'
          >
            {mutationError.message}
          </div>
        )}

        {issued && <CardDownloads key={issued.shortCode} card={issued} />}

        <Card>
          <CardHeader>
            <CardTitle>Issue or replace a card</CardTitle>
            <CardDescription>
              Search by name or member code. Issuing a new card automatically
              deactivates any previous card for that person.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-1.5'>
              <Label htmlFor='card-person-search'>Find person</Label>
              <div className='relative max-w-md'>
                <Search
                  className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                  aria-hidden='true'
                />
                <Input
                  id='card-person-search'
                  placeholder='Name or member code (e.g. Ada or CM-1001)'
                  className='pl-9'
                  value={personSearch}
                  onChange={(event) => setPersonSearch(event.target.value)}
                />
              </div>
            </div>

            {trimmedPersonSearch.length > 0 &&
              trimmedPersonSearch.length < 2 && (
                <p className='text-xs text-muted-foreground'>
                  Type at least 2 characters to search.
                </p>
              )}

            {trimmedPersonSearch.length >= 2 && (
              <div className='space-y-2'>
                <QueryState
                  loading={
                    trimmedPersonSearch !== debouncedPersonSearch ||
                    matchingPeople.isPending
                  }
                  error={matchingPeople.error}
                  empty={matchingPeople.data?.people.length === 0}
                  emptyTitle='No matching profile'
                  emptyDescription='Check the spelling or register this person at the Registration desk first.'
                  onRetry={() => void matchingPeople.refetch()}
                />
                {trimmedPersonSearch === debouncedPersonSearch &&
                  matchingPeople.data &&
                  matchingPeople.data.people.length > 0 && (
                    <div className='divide-y rounded-xl border'>
                      {matchingPeople.data.people.slice(0, 6).map((person) => (
                        <div
                          key={person.id}
                          className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'
                        >
                          <div className='flex flex-wrap items-center gap-2.5'>
                            <span className='text-sm font-medium'>
                              {person.first_name} {person.last_name}
                            </span>
                            <Badge variant='outline' className='font-mono'>
                              {person.member_code}
                            </Badge>
                            <Badge
                              variant='outline'
                              className={stageBadgeClass(
                                person.lifecycle_stage
                              )}
                            >
                              {formatStage(person.lifecycle_stage)}
                            </Badge>
                          </div>
                          <Button
                            size='sm'
                            disabled={issue.isPending}
                            onClick={() => {
                              setIssued(null)
                              issue.mutate(person.id)
                            }}
                          >
                            <CreditCard className='size-4' />
                            {issue.isPending ? 'Issuing…' : 'Issue card'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div>
                <CardTitle>Active cards</CardTitle>
                <CardDescription>
                  Currently valid cards across members and visitors.
                </CardDescription>
              </div>
              {search === debouncedCardSearch && cards.data && (
                <Badge variant='secondary'>
                  {cards.data.cards.length} active
                </Badge>
              )}
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='card-search' className='sr-only'>
                Filter active cards
              </Label>
              <div className='relative max-w-md'>
                <Search
                  className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                  aria-hidden='true'
                />
                <Input
                  id='card-search'
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder='Filter active cards by name or member code'
                  className='pl-9'
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <QueryState
              loading={search !== debouncedCardSearch || cards.isPending}
              error={cards.error}
              empty={cards.data?.cards.length === 0}
              emptyTitle={
                search.trim() ? 'No matching active cards' : 'No active cards'
              }
              emptyDescription={
                search.trim()
                  ? 'Try another name or member code.'
                  : 'Issued check-in cards will appear here.'
              }
              onRetry={() => void cards.refetch()}
            />
            {search === debouncedCardSearch &&
              cards.data &&
              cards.data.cards.length > 0 && (
                <div className='divide-y rounded-xl border'>
                  {cards.data.cards.map((card) => (
                    <div
                      key={card.id}
                      className='flex flex-wrap items-center justify-between gap-3 px-4 py-3.5'
                    >
                      <div className='space-y-1'>
                        <p className='text-sm font-medium'>
                          {card.first_name} {card.last_name}
                        </p>
                        <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                          <span className='font-mono'>{card.member_code}</span>
                          <span>·</span>
                          <span className='rounded bg-muted px-1.5 py-0.5 font-mono text-foreground'>
                            {card.short_code}
                          </span>
                          {card.issued_at && (
                            <>
                              <span>·</span>
                              <span>
                                Issued{' '}
                                {new Date(card.issued_at).toLocaleDateString(
                                  undefined,
                                  {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  }
                                )}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={issue.isPending}
                          onClick={() => {
                            setIssued(null)
                            issue.mutate(card.person_id)
                          }}
                        >
                          <RefreshCw className='size-3.5' />
                          Replace
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          className='text-destructive hover:bg-destructive/10 hover:text-destructive'
                          disabled={revoke.isPending}
                          onClick={() => setRevokeTarget(card)}
                        >
                          <ShieldX className='size-3.5' />
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        destructive
        isLoading={revoke.isPending}
        title={
          revokeTarget
            ? `Revoke card for ${revokeTarget.first_name} ${revokeTarget.last_name}?`
            : 'Revoke card?'
        }
        desc={
          revokeTarget
            ? `Card ${revokeTarget.short_code} (${revokeTarget.member_code}) will stop working at check-in immediately.`
            : ''
        }
        confirmText='Revoke card'
        handleConfirm={() => {
          if (revokeTarget) revoke.mutate(revokeTarget.id)
        }}
      />
    </ChurchPage>
  )
}
