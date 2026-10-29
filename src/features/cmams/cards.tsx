import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  CheckSquare,
  CreditCard,
  Download,
  Eye,
  FileText,
  MessageCircle,
  Printer,
  RefreshCw,
  Search,
  ShieldX,
  Square,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  downloadBlob,
  downloadDataUrl,
  printCard,
  renderBatchCardsPdf,
  renderCardPdf,
  renderCardPng,
} from './card-render'
import { formatStage, stageBadgeClass } from './format'
import { ChurchPage } from './pages'
import { QueryState } from './query-state'
import { type IssuedCard, type Person } from './types'
import { useDebouncedValue } from './use-debounced-value'

export type ActiveCard = {
  id: string
  short_code: string
  person_id: string
  member_code: string
  first_name: string
  last_name: string
  issued_at?: string
  phone?: string | null
  phone_e164?: string | null
  lifecycle_stage?: string
  scan_count?: number
  last_scanned_at?: string | null
  issued_by_name?: string | null
}

export type UnissuedPerson = {
  id: string
  member_code: string
  first_name: string
  last_name: string
  lifecycle_stage: string
  phone?: string | null
  phone_e164?: string | null
  registered_at: string
}

export function buildWhatsAppShare(card: {
  first_name?: string
  last_name?: string
  memberName?: string
  member_code?: string
  memberCode?: string
  short_code?: string
  shortCode?: string
  phone_e164?: string | null
  phone?: string | null
}) {
  const name =
    card.memberName ||
    [card.first_name, card.last_name].filter(Boolean).join(' ') ||
    'Beloved Member'
  const memberCode = card.member_code || card.memberCode || ''
  const shortCode = card.short_code || card.shortCode || ''
  const rawPhone = (card.phone_e164 || card.phone || '').replace(/\D/g, '')

  const message = [
    `*Grace Arena Mega Youth Church*`,
    `*Service Check-in Card*`,
    ``,
    `Hello ${name},`,
    ``,
    `Here are your check-in card details:`,
    `• Member Code: *${memberCode}*`,
    `• Check-in Shortcode: *${shortCode}*`,
    ``,
    `Present this shortcode or your card at the ushers' desk when you arrive for service.`,
    ``,
    `_We look forward to worshipping with you!_`,
  ].join('\n')

  return {
    rawPhone,
    message,
    whatsappUrl: rawPhone
      ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`
      : null,
  }
}

export function CardDownloads({ card }: { card: IssuedCard }) {
  const [preview, setPreview] = useState('')
  const [renderError, setRenderError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [copied, setCopied] = useState(false)

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

  function handleWhatsApp() {
    const share = buildWhatsAppShare({
      memberCode: card.memberCode,
      shortCode: card.shortCode,
      memberName: card.memberName,
      phone: card.phone,
    })
    if (share.whatsappUrl) {
      window.open(share.whatsappUrl, '_blank', 'noopener,noreferrer')
      toast.success('Opening WhatsApp…')
    } else {
      navigator.clipboard
        .writeText(share.message)
        .then(() => {
          setCopied(true)
          toast.success('Check-in details copied to clipboard!')
          setTimeout(() => setCopied(false), 2500)
        })
        .catch(() => toast.error('Could not copy to clipboard'))
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
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={!preview}
            onClick={() => void printCard(card)}
          >
            <Printer className='size-4' />
            Print Card
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='text-emerald-700 hover:text-emerald-800 dark:text-emerald-400'
            onClick={handleWhatsApp}
          >
            {copied ? (
              <Check className='size-4' />
            ) : (
              <MessageCircle className='size-4' />
            )}
            {card.phone ? 'Send via WhatsApp' : 'Copy for WhatsApp'}
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

function CardPreviewModal({
  card,
  open,
  onOpenChange,
}: {
  card: ActiveCard | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [preview, setPreview] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!card || !open) {
      setPreview('')
      return
    }
    let active = true
    renderCardPng({
      memberCode: card.member_code,
      shortCode: card.short_code,
      credential: card.short_code,
      memberName: `${card.first_name} ${card.last_name}`,
    })
      .then((dataUrl) => {
        if (active) setPreview(dataUrl)
      })
      .catch(() => {
        if (active) toast.error('Could not render card preview.')
      })
    return () => {
      active = false
    }
  }, [card, open])

  if (!card) return null
  const currentCard = card

  const issuedObj: IssuedCard = {
    memberCode: currentCard.member_code,
    shortCode: currentCard.short_code,
    credential: currentCard.short_code,
    memberName: `${currentCard.first_name} ${currentCard.last_name}`,
    phone: currentCard.phone_e164 || currentCard.phone,
  }

  async function handleDownloadPdf() {
    setPdfBusy(true)
    try {
      const bytes = await renderCardPdf(issuedObj)
      downloadBlob(
        new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }),
        `${currentCard.member_code}.pdf`
      )
      toast.success('Printable PDF downloaded.')
    } catch {
      toast.error('Could not prepare PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  function handleWhatsApp() {
    const share = buildWhatsAppShare({
      first_name: currentCard.first_name,
      last_name: currentCard.last_name,
      member_code: currentCard.member_code,
      short_code: currentCard.short_code,
      phone_e164: currentCard.phone_e164,
      phone: currentCard.phone,
    })

    if (share.whatsappUrl) {
      window.open(share.whatsappUrl, '_blank', 'noopener,noreferrer')
      toast.success('Opening WhatsApp…')
    } else {
      navigator.clipboard
        .writeText(share.message)
        .then(() => {
          setCopied(true)
          toast.success('Check-in details copied to clipboard!')
          setTimeout(() => setCopied(false), 2500)
        })
        .catch(() => toast.error('Could not copy to clipboard'))
    }
  }

  const formattedIssuedDate = card.issued_at
    ? new Date(card.issued_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  const formattedLastScan = card.last_scanned_at
    ? new Date(card.last_scanned_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <div className='flex flex-wrap items-center gap-2'>
            <DialogTitle>Member check-in card</DialogTitle>
            <Badge variant='outline' className='font-mono'>
              {card.short_code}
            </Badge>
          </div>
          <DialogDescription>
            {card.first_name} {card.last_name} · {card.member_code}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-6 sm:grid-cols-2'>
          <div className='flex flex-col items-center justify-center rounded-xl border bg-slate-50/60 p-4 dark:bg-slate-900/40'>
            {preview ? (
              <img
                src={preview}
                alt={`Attendance card for ${card.member_code}`}
                className='max-h-72 w-auto rounded-lg border bg-white shadow-sm'
              />
            ) : (
              <div className='flex h-72 w-52 items-center justify-center rounded-lg border bg-background text-sm text-muted-foreground'>
                Loading card preview…
              </div>
            )}
          </div>

          <div className='flex flex-col justify-between space-y-4 text-sm'>
            <div className='space-y-3 divide-y rounded-xl border bg-card p-4'>
              <div className='flex items-center justify-between pb-2'>
                <span className='text-muted-foreground'>Full name</span>
                <span className='font-medium text-foreground'>
                  {card.first_name} {card.last_name}
                </span>
              </div>
              <div className='flex items-center justify-between py-2'>
                <span className='text-muted-foreground'>Member code</span>
                <span className='font-mono font-semibold'>
                  {card.member_code}
                </span>
              </div>
              <div className='flex items-center justify-between py-2'>
                <span className='text-muted-foreground'>Shortcode</span>
                <Badge variant='secondary' className='font-mono'>
                  {card.short_code}
                </Badge>
              </div>
              <div className='flex items-center justify-between py-2'>
                <span className='text-muted-foreground'>Lifecycle stage</span>
                <Badge
                  variant='outline'
                  className={stageBadgeClass(card.lifecycle_stage || '')}
                >
                  {formatStage(card.lifecycle_stage || '')}
                </Badge>
              </div>
              <div className='flex items-center justify-between py-2'>
                <span className='text-muted-foreground'>Phone</span>
                <span className='tabular-nums'>
                  {card.phone || card.phone_e164 || 'None recorded'}
                </span>
              </div>
              <div className='flex items-center justify-between py-2'>
                <span className='text-muted-foreground'>Scan activity</span>
                <span className='font-medium text-foreground'>
                  {card.scan_count && card.scan_count > 0
                    ? `${card.scan_count} check-ins`
                    : 'No check-ins yet'}
                </span>
              </div>
              {formattedLastScan && (
                <div className='flex items-center justify-between py-2'>
                  <span className='text-muted-foreground'>Last check-in</span>
                  <span className='text-xs text-foreground tabular-nums'>
                    {formattedLastScan}
                  </span>
                </div>
              )}
              <div className='flex items-center justify-between pt-2 text-xs text-muted-foreground'>
                <span>Issued by</span>
                <span>
                  {card.issued_by_name || 'Staff'}{' '}
                  {formattedIssuedDate ? `· ${formattedIssuedDate}` : ''}
                </span>
              </div>
            </div>

            <div className='grid grid-cols-2 gap-2'>
              <Button
                type='button'
                size='sm'
                disabled={!preview}
                onClick={() =>
                  downloadDataUrl(preview, `${card.member_code}.png`)
                }
              >
                <Download className='size-3.5' />
                PNG
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={!preview || pdfBusy}
                onClick={() => void handleDownloadPdf()}
              >
                <FileText className='size-3.5' />
                {pdfBusy ? 'PDF…' : 'PDF'}
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={!preview}
                onClick={() => void printCard(issuedObj)}
              >
                <Printer className='size-3.5' />
                Print
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='text-emerald-700 hover:text-emerald-800 dark:text-emerald-400'
                onClick={handleWhatsApp}
              >
                {copied ? (
                  <Check className='size-3.5' />
                ) : (
                  <MessageCircle className='size-3.5' />
                )}
                WhatsApp
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className='mt-2'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CardsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('active')
  const [personSearch, setPersonSearch] = useState('')
  const [search, setSearch] = useState('')
  const [unissuedSearch, setUnissuedSearch] = useState('')
  const [issued, setIssued] = useState<IssuedCard | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ActiveCard | null>(null)
  const [previewTarget, setPreviewTarget] = useState<ActiveCard | null>(null)
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set())
  const [batchPdfBusy, setBatchPdfBusy] = useState(false)

  const trimmedPersonSearch = personSearch.trim()
  const debouncedPersonSearch = useDebouncedValue(trimmedPersonSearch)
  const debouncedCardSearch = useDebouncedValue(search)
  const debouncedUnissuedSearch = useDebouncedValue(unissuedSearch)

  const matchingPeople = useQuery({
    queryKey: ['people', 'card-issue', debouncedPersonSearch],
    queryFn: () =>
      api<{ people: Person[] }>(
        `/api/v1/people?q=${encodeURIComponent(debouncedPersonSearch)}`
      ),
    enabled: debouncedPersonSearch.length >= 2,
  })

  const cardsQuery = useQuery({
    queryKey: ['cards', debouncedCardSearch],
    queryFn: () =>
      api<{ cards: ActiveCard[]; unissued?: UnissuedPerson[] }>(
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
      toast.success(`Check-in card generated for ${card.memberCode}`)
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to issue card')
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/cards/${id}/revoke`, { method: 'POST', body: '{}' }),
    onSuccess: async () => {
      setIssued(null)
      setRevokeTarget(null)
      toast.success('Card revoked successfully')
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to revoke card')
    },
  })

  const mutationError = issue.error || revoke.error
  const allActiveCards = cardsQuery.data?.cards ?? []
  const allUnissued = cardsQuery.data?.unissued ?? []

  // Filter unissued by search term
  const filteredUnissued = debouncedUnissuedSearch
    ? allUnissued.filter((person) => {
        const query = debouncedUnissuedSearch.toLowerCase()
        const fullName =
          `${person.first_name} ${person.last_name}`.toLowerCase()
        return (
          fullName.includes(query) ||
          person.member_code.toLowerCase().includes(query)
        )
      })
    : allUnissued

  function toggleCardSelection(id: string) {
    setSelectedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedCards.size === allActiveCards.length) {
      setSelectedCards(new Set())
    } else {
      setSelectedCards(new Set(allActiveCards.map((c) => c.id)))
    }
  }

  async function handleBatchPdf() {
    const targetCards =
      selectedCards.size > 0
        ? allActiveCards.filter((c) => selectedCards.has(c.id))
        : allActiveCards

    if (!targetCards.length) {
      toast.error('No active cards to print.')
      return
    }

    setBatchPdfBusy(true)
    try {
      const issuedList: IssuedCard[] = targetCards.map((c) => ({
        memberCode: c.member_code,
        shortCode: c.short_code,
        credential: c.short_code,
        memberName: `${c.first_name} ${c.last_name}`,
        phone: c.phone_e164 || c.phone,
      }))
      const bytes = await renderBatchCardsPdf(issuedList)
      downloadBlob(
        new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }),
        `grace-arena-cards-batch-${targetCards.length}.pdf`
      )
      toast.success(
        `Generated A4 batch sheet with ${targetCards.length} cards and cut lines.`
      )
    } catch {
      toast.error('Could not generate the batch printable sheet.')
    } finally {
      setBatchPdfBusy(false)
    }
  }

  return (
    <ChurchPage
      title='Member cards'
      description='Issue new check-in cards, preview & print badges, share via WhatsApp, or manage card credentials.'
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

        <div className='space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground'>
              <button
                type='button'
                onClick={() => setActiveTab('active')}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-medium transition-all ${
                  activeTab === 'active'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'hover:text-foreground'
                }`}
              >
                <CreditCard className='size-4' />
                <span>Active cards</span>
                <Badge variant='secondary' className='ml-1 px-1.5 py-0 text-xs'>
                  {allActiveCards.length}
                </Badge>
              </button>
              <button
                type='button'
                onClick={() => setActiveTab('unissued')}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-medium transition-all ${
                  activeTab === 'unissued'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'hover:text-foreground'
                }`}
              >
                <Users className='size-4' />
                <span>Unissued members</span>
                {allUnissued.length > 0 && (
                  <Badge
                    variant='outline'
                    className='ml-1 bg-amber-50 px-1.5 py-0 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  >
                    {allUnissued.length}
                  </Badge>
                )}
              </button>
            </div>

            {activeTab === 'active' && allActiveCards.length > 0 && (
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={batchPdfBusy}
                  onClick={() => void handleBatchPdf()}
                >
                  <FileText className='size-4' />
                  {batchPdfBusy
                    ? 'Preparing A4 sheet…'
                    : selectedCards.size > 0
                      ? `Print A4 sheet (${selectedCards.size})`
                      : `Print all to A4 (${allActiveCards.length})`}
                </Button>
              </div>
            )}
          </div>

          {activeTab === 'active' && (
            <Card>
              <CardHeader className='space-y-3 pb-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <CardTitle>Active cards</CardTitle>
                    <CardDescription>
                      Currently valid check-in cards across registered members
                      and visitors.
                    </CardDescription>
                  </div>
                  {search === debouncedCardSearch && (
                    <Badge variant='secondary'>
                      {allActiveCards.length} active
                    </Badge>
                  )}
                </div>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='relative max-w-md flex-1'>
                    <Search
                      className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                      aria-hidden='true'
                    />
                    <Input
                      id='card-search'
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder='Filter active cards by name, member code, or shortcode'
                      className='pl-9'
                    />
                  </div>

                  {allActiveCards.length > 0 && (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={toggleSelectAll}
                      className='text-xs text-muted-foreground'
                    >
                      {selectedCards.size === allActiveCards.length ? (
                        <>
                          <CheckSquare className='mr-1.5 size-3.5' />
                          Deselect all
                        </>
                      ) : (
                        <>
                          <Square className='mr-1.5 size-3.5' />
                          Select all ({allActiveCards.length})
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <QueryState
                  loading={
                    search !== debouncedCardSearch || cardsQuery.isPending
                  }
                  error={cardsQuery.error}
                  empty={allActiveCards.length === 0}
                  emptyTitle={
                    search.trim()
                      ? 'No matching active cards'
                      : 'No active cards'
                  }
                  emptyDescription={
                    search.trim()
                      ? 'Try another name or member code.'
                      : 'Issued check-in cards will appear here.'
                  }
                  onRetry={() => void cardsQuery.refetch()}
                />
                {search === debouncedCardSearch &&
                  allActiveCards.length > 0 && (
                    <div className='divide-y rounded-xl border'>
                      {allActiveCards.map((card) => {
                        const isSelected = selectedCards.has(card.id)
                        const share = buildWhatsAppShare({
                          first_name: card.first_name,
                          last_name: card.last_name,
                          member_code: card.member_code,
                          short_code: card.short_code,
                          phone_e164: card.phone_e164,
                          phone: card.phone,
                        })

                        return (
                          <div
                            key={card.id}
                            className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors ${
                              isSelected
                                ? 'bg-sky-50/50 dark:bg-sky-950/20'
                                : 'hover:bg-muted/40'
                            }`}
                          >
                            <div className='flex items-center gap-3'>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() =>
                                  toggleCardSelection(card.id)
                                }
                                aria-label={`Select ${card.first_name} ${card.last_name}`}
                              />
                              <div className='space-y-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                  <p className='text-sm font-semibold text-foreground'>
                                    {card.first_name} {card.last_name}
                                  </p>
                                  {card.lifecycle_stage && (
                                    <Badge
                                      variant='outline'
                                      className={stageBadgeClass(
                                        card.lifecycle_stage
                                      )}
                                    >
                                      {formatStage(card.lifecycle_stage)}
                                    </Badge>
                                  )}
                                </div>
                                <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                                  <span className='font-mono font-medium'>
                                    {card.member_code}
                                  </span>
                                  <span>·</span>
                                  <span className='rounded bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground'>
                                    {card.short_code}
                                  </span>
                                  {card.issued_at && (
                                    <>
                                      <span>·</span>
                                      <span>
                                        Issued{' '}
                                        {new Date(
                                          card.issued_at
                                        ).toLocaleDateString(undefined, {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                        })}
                                      </span>
                                    </>
                                  )}
                                  {card.scan_count !== undefined && (
                                    <>
                                      <span>·</span>
                                      <span className='font-medium text-foreground'>
                                        {card.scan_count > 0
                                          ? `${card.scan_count} check-ins`
                                          : '0 check-ins'}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className='flex flex-wrap items-center gap-1.5'>
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={() => setPreviewTarget(card)}
                                title='View card'
                              >
                                <Eye className='size-3.5' />
                                View
                              </Button>

                              <Button
                                variant='outline'
                                size='sm'
                                className='text-emerald-700 hover:text-emerald-800 dark:text-emerald-400'
                                title='Send via WhatsApp'
                                onClick={() => {
                                  if (share.whatsappUrl) {
                                    window.open(
                                      share.whatsappUrl,
                                      '_blank',
                                      'noopener,noreferrer'
                                    )
                                    toast.success('Opening WhatsApp…')
                                  } else {
                                    navigator.clipboard
                                      .writeText(share.message)
                                      .then(() =>
                                        toast.success(
                                          'Check-in details copied to clipboard!'
                                        )
                                      )
                                      .catch(() =>
                                        toast.error(
                                          'Could not copy to clipboard'
                                        )
                                      )
                                  }
                                }}
                              >
                                <MessageCircle className='size-3.5' />
                                <span className='hidden sm:inline'>
                                  WhatsApp
                                </span>
                              </Button>

                              <Button
                                variant='outline'
                                size='sm'
                                disabled={issue.isPending}
                                onClick={() => {
                                  setIssued(null)
                                  issue.mutate(card.person_id)
                                }}
                                title='Replace card'
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
                                title='Revoke card'
                              >
                                <ShieldX className='size-3.5' />
                                Revoke
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'unissued' && (
            <Card>
              <CardHeader className='space-y-3 pb-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <CardTitle>Unissued members</CardTitle>
                    <CardDescription>
                      Registered members and first-timers who do not have an
                      active check-in card yet. Issue a card with 1 click.
                    </CardDescription>
                  </div>
                  <Badge variant='outline'>
                    {filteredUnissued.length} waiting
                  </Badge>
                </div>
                <div className='relative max-w-md'>
                  <Search
                    className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                    aria-hidden='true'
                  />
                  <Input
                    value={unissuedSearch}
                    onChange={(event) => setUnissuedSearch(event.target.value)}
                    placeholder='Filter unissued by name or member code'
                    className='pl-9'
                  />
                </div>
              </CardHeader>
              <CardContent>
                {filteredUnissued.length === 0 ? (
                  <div className='rounded-xl border border-dashed p-8 text-center'>
                    <CreditCard className='mx-auto size-8 text-muted-foreground/60' />
                    <h3 className='mt-3 font-semibold text-foreground'>
                      {unissuedSearch.trim()
                        ? 'No unissued members match your search'
                        : 'All members have active cards!'}
                    </h3>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {unissuedSearch.trim()
                        ? 'Try clearing the search filter.'
                        : 'When new members or first-timers register, they will appear here until a card is issued.'}
                    </p>
                  </div>
                ) : (
                  <div className='divide-y rounded-xl border'>
                    {filteredUnissued.map((person) => (
                      <div
                        key={person.id}
                        className='flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30'
                      >
                        <div className='space-y-1'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span className='text-sm font-semibold text-foreground'>
                              {person.first_name} {person.last_name}
                            </span>
                            <Badge
                              variant='outline'
                              className={stageBadgeClass(
                                person.lifecycle_stage
                              )}
                            >
                              {formatStage(person.lifecycle_stage)}
                            </Badge>
                          </div>
                          <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                            <span className='font-mono font-medium'>
                              {person.member_code}
                            </span>
                            {person.phone && (
                              <>
                                <span>·</span>
                                <span className='tabular-nums'>
                                  {person.phone}
                                </span>
                              </>
                            )}
                            {person.registered_at && (
                              <>
                                <span>·</span>
                                <span>
                                  Registered{' '}
                                  {new Date(
                                    person.registered_at
                                  ).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <Button
                          size='sm'
                          disabled={issue.isPending}
                          onClick={() => {
                            setIssued(null)
                            issue.mutate(person.id)
                          }}
                        >
                          <CreditCard className='size-3.5' />
                          {issue.isPending ? 'Issuing…' : 'Issue card'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <CardPreviewModal
        card={previewTarget}
        open={!!previewTarget}
        onOpenChange={(open) => {
          if (!open) setPreviewTarget(null)
        }}
      />

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
