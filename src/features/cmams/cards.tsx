import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/cmams-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { type IssuedCard } from './types'

type ActiveCard = {
  id: string
  short_code: string
  person_id: string
  member_code: string
  first_name: string
  last_name: string
}

export function CardDownloads({ card }: { card: IssuedCard }) {
  return (
    <Card className='border-sky-300'>
      <CardHeader>
        <CardTitle>Credential ready · {card.memberCode}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          Download both versions now. The raw QR code is not retained by the
          database. If lost, a supervisor must revoke and issue a new
          credential.
        </p>
        <img
          src={`data:image/png;base64,${card.png}`}
          alt={`Attendance card for ${card.memberCode}, shortcode ${card.shortCode}`}
          className='w-48 rounded-lg border'
        />
        <div className='flex flex-wrap gap-3'>
          <Button asChild>
            <a
              download={`${card.memberCode}.png`}
              href={`data:image/png;base64,${card.png}`}
            >
              Download PNG
            </a>
          </Button>
          <Button variant='outline' asChild>
            <a
              download={`${card.memberCode}.pdf`}
              href={`data:application/pdf;base64,${card.pdf}`}
            >
              Download printable PDF
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function CardsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [issued, setIssued] = useState<IssuedCard | null>(null)
  const [personId, setPersonId] = useState('')
  const cards = useQuery({
    queryKey: ['cards', search],
    queryFn: () =>
      api<{ cards: ActiveCard[] }>(
        `/api/v1/cards?q=${encodeURIComponent(search)}`
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
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/cards/${id}/revoke`, { method: 'POST', body: '{}' }),
    onSuccess: async () => {
      setIssued(null)
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
  })

  return (
    <ChurchPage
      title='Member cards'
      description='Issue an opaque credential or replace one that is lost or compromised.'
    >
      <div className='max-w-3xl space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>Issue a credential</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <Label htmlFor='card-person'>Person ID</Label>
            <div className='flex flex-wrap gap-2'>
              <Input
                id='card-person'
                placeholder='Paste the person ID from registration'
                className='max-w-md'
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
              />
              <Button
                disabled={issue.isPending || !personId.trim()}
                onClick={() => {
                  setIssued(null)
                  issue.mutate(personId.trim())
                }}
              >
                {issue.isPending ? 'Generating…' : 'Issue card'}
              </Button>
            </div>
            <p className='text-xs text-muted-foreground'>
              Issuing another credential invalidates the previous one. Record
              the member’s identity before replacing a card.
            </p>
          </CardContent>
        </Card>
        {issued && <CardDownloads card={issued} />}
        <div className='space-y-2'>
          <Label htmlFor='card-search'>Find active cards</Label>
          <Input
            id='card-search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='Name or member code'
            className='max-w-md'
          />
        </div>
        <QueryState
          loading={cards.isPending}
          error={cards.error}
          empty={cards.data?.cards.length === 0}
          onRetry={() => void cards.refetch()}
        />
        {cards.data?.cards.map((card) => (
          <div
            key={card.id}
            className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4'
          >
            <div>
              <strong>
                {card.first_name} {card.last_name}
              </strong>
              <p className='text-sm text-muted-foreground'>
                {card.member_code} · {card.short_code}
              </p>
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={issue.isPending}
                onClick={() => {
                  setIssued(null)
                  issue.mutate(card.person_id)
                }}
              >
                Reissue
              </Button>
              <Button
                variant='destructive'
                size='sm'
                disabled={revoke.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Revoke this card? It will stop working immediately.'
                    )
                  )
                    revoke.mutate(card.id)
                }}
              >
                Revoke
              </Button>
            </div>
          </div>
        ))}
        {(issue.error || revoke.error) && (
          <p role='alert' className='text-sm text-destructive'>
            {(issue.error || revoke.error)?.message}
          </p>
        )}
      </div>
    </ChurchPage>
  )
}
