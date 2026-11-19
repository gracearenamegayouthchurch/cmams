import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  CheckSquare,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  MessageCircle,
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  buildWhatsAppShare,
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

type ReplacePromptTarget = {
  personId: string
  name: string
  memberCode: string
  shortCode?: string
}

function formatShortDate(iso?: string | null, withTime = false) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

function ShortCodePill({
  code,
  className = '',
}: {
  code: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true)
        toast.success(`Copied ${code}`)
        setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => toast.error('Could not copy shortcode'))
  }

  return (
    <button
      type='button'
      onClick={copyCode}
      title={`Copy shortcode ${code}`}
      className={`inline-flex items-center gap-1 rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground transition-colors hover:bg-muted ${className}`}
    >
      <span>{code}</span>
      {copied ? (
        <Check className='size-3 text-emerald-600' aria-hidden='true' />
      ) : (
        <Copy className='size-3 opacity-60' aria-hidden='true' />
      )}
    </button>
  )
}

function shareCardDetails(
  share: ReturnType<typeof buildWhatsAppShare>,
  onCopied?: () => void
) {
  if (share.whatsappUrl) {
    window.open(share.whatsappUrl, '_blank', 'noopener,noreferrer')
    toast.success('Opening WhatsApp…')
    return
  }
  navigator.clipboard
    .writeText(share.message)
    .then(() => {
      onCopied?.()
      toast.success('Check-in details copied to clipboard!')
    })
    .catch(() => toast.error('Could not copy to clipboard'))
}

function useRenderedCardPng(card: IssuedCard | null) {
  const cardKey = card
    ? `${card.memberCode}|${card.shortCode}|${card.credential}|${card.memberName ?? ''}`
    : ''
  const [rendered, setRendered] = useState<{
    key: string
    url: string
    error: string
  } | null>(null)

  useEffect(() => {
    if (!card) return
    let active = true
    renderCardPng(card)
      .then((url) => {
        if (active) setRendered({ key: cardKey, url, error: '' })
      })
      .catch(() => {
        if (active) {
          setRendered({
            key: cardKey,
            url: '',
            error: 'Could not render the card in this browser.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [card, cardKey])

  return {
    preview: rendered?.key === cardKey ? rendered.url : '',
    renderError: rendered?.key === cardKey ? rendered.error : '',
  }
}

export function CardDownloads({
  card,
  onBack,
}: {
  card: IssuedCard
  onBack?: () => void
}) {
  const { preview, renderError } = useRenderedCardPng(card)
  const [pdfError, setPdfError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const share = buildWhatsAppShare({
    memberCode: card.memberCode,
    shortCode: card.shortCode,
    memberName: card.memberName,
    phone: card.phone,
  })

  async function downloadPdf() {
    setPdfBusy(true)
    setPdfError('')
    try {
      const bytes = await renderCardPdf(card)
      downloadBlob(
        new Blob([Uint8Array.from(bytes).buffer], {
          type: 'application/pdf',
        }),
        `${card.memberCode}.pdf`
      )
    } catch {
      setPdfError('Could not prepare the printable PDF. Try again.')
    } finally {
      setPdfBusy(false)
    }
  }

  function handleShare() {
    shareCardDetails(share, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const combinedError = pdfError || renderError

  return (
    <Card className='border-sky-500/45 bg-sky-50/30 dark:bg-sky-950/20'>
      <CardHeader className='pb-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            {onBack && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='-ml-1 h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground'
                onClick={onBack}
              >
                <ArrowLeft className='size-3.5' />
                <span>Back to cards</span>
              </Button>
            )}
            <CardTitle className='text-base'>
              Card ready · {card.memberCode}
              {card.memberName ? ` (${card.memberName})` : ''}
            </CardTitle>
          </div>
          <ShortCodePill code={card.shortCode} className='bg-background' />
        </div>
        <CardDescription>
          Download or print this badge now. For security, the full QR
          credential is displayed only at issuance—if a card is lost, issue a
          replacement.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex flex-col gap-5 sm:flex-row sm:items-start'>
          {preview ? (
            <img
              src={preview}
              alt={`Attendance card for ${card.memberCode}`}
              className='w-44 shrink-0 rounded-lg border bg-white shadow-xs'
            />
          ) : (
            <div className='flex h-56 w-44 shrink-0 items-center justify-center rounded-lg border bg-background p-3 text-center text-sm text-muted-foreground'>
              Preparing card…
            </div>
          )}

          <div className='flex flex-1 flex-col gap-3'>
            <div className='flex flex-wrap gap-2'>
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
                Print card
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='text-emerald-700 hover:text-emerald-800 dark:text-emerald-400'
                onClick={handleShare}
              >
                {copied ? (
                  <Check className='size-4' />
                ) : share.whatsappUrl ? (
                  <MessageCircle className='size-4' />
                ) : (
                  <Copy className='size-4' />
                )}
                {share.whatsappUrl ? 'Send via WhatsApp' : 'Copy for WhatsApp'}
              </Button>
            </div>
            {combinedError && (
              <p role='alert' className='text-sm text-destructive'>
                {combinedError}
              </p>
            )}
          </div>
        </div>
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
  const issuedObj: IssuedCard | null =
    card && open
      ? {
          memberCode: card.member_code,
          shortCode: card.short_code,
          credential: card.short_code,
          memberName: `${card.first_name} ${card.last_name}`,
          phone: card.phone_e164 || card.phone,
        }
      : null

  const { preview, renderError } = useRenderedCardPng(issuedObj)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!card || !issuedObj) return null

  const share = buildWhatsAppShare({
    first_name: card.first_name,
    last_name: card.last_name,
    member_code: card.member_code,
    short_code: card.short_code,
    phone_e164: card.phone_e164,
    phone: card.phone,
  })

  async function handleDownloadPdf() {
    if (!issuedObj || !card) return
    setPdfBusy(true)
    try {
      const bytes = await renderCardPdf(issuedObj)
      downloadBlob(
        new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }),
        `${card.member_code}.pdf`
      )
      toast.success('Printable PDF downloaded.')
    } catch {
      toast.error('Could not prepare PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  function handleShare() {
    shareCardDetails(share, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const formattedIssuedDate = formatShortDate(card.issued_at)
  const formattedLastScan = formatShortDate(card.last_scanned_at, true)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <div className='flex items-center justify-between gap-2 pr-6'>
            <DialogTitle>Member check-in card</DialogTitle>
            <ShortCodePill code={card.short_code} />
          </div>
          <DialogDescription>
            {card.first_name} {card.last_name} · {card.member_code}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-6 sm:grid-cols-2'>
          <div className='flex flex-col items-center justify-center gap-2.5 rounded-xl border bg-muted/25 p-4'>
            {preview ? (
              <img
                src={preview}
                alt={`Attendance card for ${card.member_code}`}
                className='max-h-72 w-auto rounded-lg border bg-white shadow-sm'
              />
            ) : (
              <div className='flex h-72 w-52 items-center justify-center rounded-lg border bg-background p-3 text-center text-sm text-muted-foreground'>
                {renderError || 'Loading card preview…'}
              </div>
            )}
            <p className='text-center text-[11px] text-muted-foreground'>
              Reprint preview encodes the backup shortcode QR. Issue a
              replacement if a fresh primary QR credential is needed.
            </p>
          </div>

          <div className='flex flex-col justify-between gap-4 text-sm'>
            <dl className='divide-y rounded-xl border bg-card px-4 py-1'>
              <div className='flex items-center justify-between gap-3 py-2.5'>
                <dt className='text-muted-foreground'>Full name</dt>
                <dd className='text-right font-medium text-foreground'>
                  {card.first_name} {card.last_name}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-3 py-2.5'>
                <dt className='text-muted-foreground'>Member code</dt>
                <dd className='font-mono font-semibold'>{card.member_code}</dd>
              </div>
              <div className='flex items-center justify-between gap-3 py-2.5'>
                <dt className='text-muted-foreground'>Shortcode</dt>
                <dd>
                  <Badge variant='secondary' className='font-mono'>
                    {card.short_code}
                  </Badge>
                </dd>
              </div>
              {card.lifecycle_stage && (
                <div className='flex items-center justify-between gap-3 py-2.5'>
                  <dt className='text-muted-foreground'>Stage</dt>
                  <dd>
                    <Badge
                      variant='outline'
                      className={stageBadgeClass(card.lifecycle_stage)}
                    >
                      {formatStage(card.lifecycle_stage)}
                    </Badge>
                  </dd>
                </div>
              )}
              <div className='flex items-center justify-between gap-3 py-2.5'>
                <dt className='text-muted-foreground'>Phone</dt>
                <dd className='tabular-nums'>
                  {card.phone || card.phone_e164 || 'None recorded'}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-3 py-2.5'>
                <dt className='text-muted-foreground'>Check-ins</dt>
                <dd className='font-medium tabular-nums'>
                  {card.scan_count && card.scan_count > 0
                    ? `${card.scan_count}`
                    : '0'}
                </dd>
              </div>
              {formattedLastScan && (
                <div className='flex items-center justify-between gap-3 py-2.5'>
                  <dt className='text-muted-foreground'>Last scan</dt>
                  <dd className='text-xs tabular-nums'>{formattedLastScan}</dd>
                </div>
              )}
              <div className='flex items-center justify-between gap-3 py-2.5 text-xs text-muted-foreground'>
                <dt>Issued</dt>
                <dd className='text-right'>
                  {card.issued_by_name || 'Staff'}
                  {formattedIssuedDate ? ` · ${formattedIssuedDate}` : ''}
                </dd>
              </div>
            </dl>

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
                onClick={handleShare}
              >
                {copied ? (
                  <Check className='size-3.5' />
                ) : share.whatsappUrl ? (
                  <MessageCircle className='size-3.5' />
                ) : (
                  <Copy className='size-3.5' />
                )}
                {share.whatsappUrl ? 'WhatsApp' : 'Copy'}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className='sm:justify-start'>
          <Button
            type='button'
            variant='outline'
            className='gap-1.5'
            onClick={() => onOpenChange(false)}
          >
            <ArrowLeft className='size-3.5' />
            <span>Back to cards</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CardsPage() {
  const queryClient = useQueryClient()
  const issuedRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'active' | 'unissued'>('active')
  const [activeFilter, setActiveFilter] = useState<
    'ALL' | 'MEMBER' | 'FIRST_TIMER' | 'UNSCANNED'
  >('ALL')
  const [unissuedFilter, setUnissuedFilter] = useState<
    'ALL' | 'MEMBER' | 'FIRST_TIMER'
  >('ALL')
  const [personSearch, setPersonSearch] = useState('')
  const [search, setSearch] = useState('')
  const [unissuedSearch, setUnissuedSearch] = useState('')
  const [issued, setIssued] = useState<IssuedCard | null>(null)
  const [issuingPersonId, setIssuingPersonId] = useState<string | null>(null)
  const [replaceTarget, setReplaceTarget] =
    useState<ReplacePromptTarget | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ActiveCard | null>(null)
  const [previewTarget, setPreviewTarget] = useState<ActiveCard | null>(null)
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set())
  const [selectedUnissued, setSelectedUnissued] = useState<Set<string>>(
    new Set()
  )
  const [batchPdfBusy, setBatchPdfBusy] = useState(false)
  const [batchIssueProgress, setBatchIssueProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  useEffect(() => {
    if (issued) {
      issuedRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [issued])

  const trimmedPersonSearch = personSearch.trim()
  const debouncedPersonSearch = useDebouncedValue(trimmedPersonSearch)
  const debouncedCardSearch = useDebouncedValue(search.trim())
  const debouncedUnissuedSearch = useDebouncedValue(unissuedSearch.trim())

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
    mutationFn: (id: string) => {
      setIssuingPersonId(id)
      return api<{ card: IssuedCard }>(`/api/v1/people/${id}/cards`, {
        method: 'POST',
        body: '{}',
      })
    },
    onSuccess: async ({ card }) => {
      setIssued(card)
      setPersonSearch('')
      setReplaceTarget(null)
      toast.success(`Check-in card ready for ${card.memberCode}`)
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to issue card')
    },
    onSettled: () => {
      setIssuingPersonId(null)
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/cards/${id}/revoke`, { method: 'POST', body: '{}' }),
    onSuccess: async (_, id) => {
      setIssued(null)
      setRevokeTarget(null)
      setSelectedCards((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      toast.success('Card revoked')
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to revoke card')
    },
  })

  const mutationError = issue.error || revoke.error
  const allActiveCards = cardsQuery.data?.cards ?? []
  const allUnissued = cardsQuery.data?.unissued ?? []

  const activeCardByPersonId = new Map(
    allActiveCards.map((card) => [card.person_id, card] as const)
  )
  const visibleActiveCards = allActiveCards.filter((card) => {
    if (activeFilter === 'MEMBER') return card.lifecycle_stage === 'MEMBER'
    if (activeFilter === 'FIRST_TIMER')
      return card.lifecycle_stage === 'FIRST_TIMER'
    if (activeFilter === 'UNSCANNED') return (card.scan_count ?? 0) === 0
    return true
  })
  const visibleCardIds = new Set(visibleActiveCards.map((card) => card.id))
  const visibleSelectedCards = visibleActiveCards.filter((card) =>
    selectedCards.has(card.id)
  )
  const allVisibleSelected =
    visibleActiveCards.length > 0 &&
    visibleSelectedCards.length === visibleActiveCards.length

  const filteredUnissued = allUnissued.filter((person) => {
    if (unissuedFilter === 'MEMBER' && person.lifecycle_stage !== 'MEMBER')
      return false
    if (
      unissuedFilter === 'FIRST_TIMER' &&
      person.lifecycle_stage !== 'FIRST_TIMER'
    )
      return false
    if (!debouncedUnissuedSearch) return true
    const query = debouncedUnissuedSearch.toLowerCase()
    const fullName = `${person.first_name} ${person.last_name}`.toLowerCase()
    return (
      fullName.includes(query) ||
      person.member_code.toLowerCase().includes(query)
    )
  })
  const visibleUnissuedIds = new Set(filteredUnissued.map((p) => p.id))
  const visibleSelectedUnissued = filteredUnissued.filter((person) =>
    selectedUnissued.has(person.id)
  )
  const allVisibleUnissuedSelected =
    filteredUnissued.length > 0 &&
    visibleSelectedUnissued.length === filteredUnissued.length

  function toggleUnissuedSelection(id: string) {
    setSelectedUnissued((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllUnissued() {
    if (allVisibleUnissuedSelected) {
      setSelectedUnissued((prev) => {
        const next = new Set(prev)
        for (const id of visibleUnissuedIds) next.delete(id)
        return next
      })
    } else {
      setSelectedUnissued((prev) => {
        const next = new Set(prev)
        for (const id of visibleUnissuedIds) next.add(id)
        return next
      })
    }
  }

  async function handleBatchIssue(exportPdf: boolean) {
    const targets =
      visibleSelectedUnissued.length > 0
        ? visibleSelectedUnissued
        : filteredUnissued
    if (!targets.length || batchIssueProgress) return

    setBatchIssueProgress({ done: 0, total: targets.length })
    const minted: IssuedCard[] = []
    let failed = 0
    try {
      for (let index = 0; index < targets.length; index++) {
        const person = targets[index]
        try {
          const response = await api<{ card: IssuedCard }>(
            `/api/v1/people/${person.id}/cards`,
            { method: 'POST', body: '{}' }
          )
          minted.push({
            ...response.card,
            memberName:
              response.card.memberName ||
              `${person.first_name} ${person.last_name}`,
            phone: response.card.phone ?? person.phone_e164 ?? person.phone,
          })
        } catch {
          failed++
        }
        setBatchIssueProgress({ done: index + 1, total: targets.length })
      }

      if (minted.length > 0) {
        setSelectedUnissued(new Set())
        await queryClient.invalidateQueries({ queryKey: ['cards'] })
        if (exportPdf) {
          const bytes = await renderBatchCardsPdf(minted)
          downloadBlob(
            new Blob([Uint8Array.from(bytes).buffer], {
              type: 'application/pdf',
            }),
            `grace-arena-issued-cards-${minted.length}.pdf`
          )
          toast.success(
            `Issued ${minted.length} ${
              minted.length === 1 ? 'card' : 'cards'
            } and downloaded the A4 sheet.`
          )
        } else {
          toast.success(
            `Issued ${minted.length} ${minted.length === 1 ? 'card' : 'cards'}.`
          )
        }
        if (minted.length === 1) {
          setIssued(minted[0])
        }
      }
      if (failed > 0) {
        toast.error(
          `${failed} ${failed === 1 ? 'card' : 'cards'} could not be issued.`
        )
      }
    } catch {
      toast.error('Batch card issuance could not complete.')
    } finally {
      setBatchIssueProgress(null)
    }
  }

  function toggleCardSelection(id: string) {
    setSelectedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedCards((prev) => {
        const next = new Set(prev)
        for (const id of visibleCardIds) next.delete(id)
        return next
      })
    } else {
      setSelectedCards((prev) => {
        const next = new Set(prev)
        for (const id of visibleCardIds) next.add(id)
        return next
      })
    }
  }

  async function handleBatchPdf() {
    const targetCards =
      visibleSelectedCards.length > 0
        ? visibleSelectedCards
        : visibleActiveCards

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
        `Generated A4 batch sheet with ${targetCards.length} ${
          targetCards.length === 1 ? 'card' : 'cards'
        }.`
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
      description='Issue check-in cards, print badges or A4 sheets, and manage active credentials.'
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

        {issued && (
          <div ref={issuedRef}>
            <CardDownloads
              key={issued.shortCode}
              card={issued}
              onBack={() => setIssued(null)}
            />
          </div>
        )}

        <Card>
          <CardHeader className='pb-4'>
            <CardTitle>Issue or replace a card</CardTitle>
            <CardDescription>
              Search by name or member code. Replacing an active card
              deactivates the previous credential immediately.
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
                      {matchingPeople.data.people.slice(0, 6).map((person) => {
                        const existingCard = activeCardByPersonId.get(
                          person.id
                        )
                        const isIssuingThis =
                          issue.isPending && issuingPersonId === person.id
                        const isInactive =
                          person.lifecycle_stage === 'INACTIVE' ||
                          person.lifecycle_stage === 'ARCHIVED'

                        return (
                          <div
                            key={person.id}
                            className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'
                          >
                            <div className='flex flex-wrap items-center gap-2'>
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
                              {existingCard && (
                                <span className='font-mono text-xs text-muted-foreground'>
                                  Active · {existingCard.short_code}
                                </span>
                              )}
                            </div>
                            {existingCard ? (
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={issue.isPending || isInactive}
                                onClick={() =>
                                  setReplaceTarget({
                                    personId: person.id,
                                    name: `${person.first_name} ${person.last_name}`,
                                    memberCode: person.member_code,
                                    shortCode: existingCard.short_code,
                                  })
                                }
                              >
                                <RefreshCw className='size-3.5' />
                                {isIssuingThis ? 'Replacing…' : 'Replace card'}
                              </Button>
                            ) : (
                              <Button
                                size='sm'
                                disabled={issue.isPending || isInactive}
                                onClick={() => {
                                  setIssued(null)
                                  issue.mutate(person.id)
                                }}
                              >
                                <CreditCard className='size-4' />
                                {isIssuingThis ? 'Issuing…' : 'Issue card'}
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className='space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div
              role='tablist'
              aria-label='Card views'
              className='inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground'
            >
              <button
                type='button'
                role='tab'
                aria-selected={activeTab === 'active'}
                onClick={() => setActiveTab('active')}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-medium transition-all ${
                  activeTab === 'active'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'hover:text-foreground'
                }`}
              >
                <CreditCard className='size-4' />
                <span>Active cards</span>
                <Badge variant='secondary' className='px-1.5 py-0 text-xs tabular-nums'>
                  {allActiveCards.length}
                </Badge>
              </button>
              <button
                type='button'
                role='tab'
                aria-selected={activeTab === 'unissued'}
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
                    className='bg-amber-50 px-1.5 py-0 text-xs text-amber-700 tabular-nums dark:bg-amber-950/40 dark:text-amber-300'
                  >
                    {allUnissued.length}
                  </Badge>
                )}
              </button>
            </div>

            {activeTab === 'active' && visibleActiveCards.length > 0 && (
              <div className='flex items-center gap-2'>
                {visibleSelectedCards.length > 0 && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='text-xs text-muted-foreground'
                    onClick={() => setSelectedCards(new Set())}
                  >
                    Clear ({visibleSelectedCards.length})
                  </Button>
                )}
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={batchPdfBusy}
                  onClick={() => void handleBatchPdf()}
                >
                  <FileText className='size-4' />
                  {batchPdfBusy
                    ? 'Preparing A4 sheet…'
                    : visibleSelectedCards.length > 0
                      ? `Print A4 sheet (${visibleSelectedCards.length})`
                      : `Print all to A4 (${visibleActiveCards.length})`}
                </Button>
              </div>
            )}

            {activeTab === 'unissued' && filteredUnissued.length > 0 && (
              <div className='flex flex-wrap items-center gap-2'>
                {visibleSelectedUnissued.length > 0 && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='text-xs text-muted-foreground'
                    disabled={!!batchIssueProgress}
                    onClick={() => setSelectedUnissued(new Set())}
                  >
                    Clear ({visibleSelectedUnissued.length})
                  </Button>
                )}
                {visibleSelectedUnissued.length > 0 && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={!!batchIssueProgress || issue.isPending}
                    onClick={() => void handleBatchIssue(false)}
                  >
                    <CreditCard className='size-4' />
                    {batchIssueProgress
                      ? `Issuing ${batchIssueProgress.done}/${batchIssueProgress.total}…`
                      : `Issue selected (${visibleSelectedUnissued.length})`}
                  </Button>
                )}
                <Button
                  type='button'
                  size='sm'
                  disabled={!!batchIssueProgress || issue.isPending}
                  onClick={() => void handleBatchIssue(true)}
                >
                  <FileText className='size-4' />
                  {batchIssueProgress
                    ? `Issuing ${batchIssueProgress.done}/${batchIssueProgress.total}…`
                    : visibleSelectedUnissued.length > 0
                      ? `Issue & export A4 (${visibleSelectedUnissued.length})`
                      : `Issue all & export A4 (${filteredUnissued.length})`}
                </Button>
              </div>
            )}
          </div>

          {activeTab === 'active' && (
            <Card>
              <CardHeader className='space-y-3 pb-3'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='relative max-w-md flex-1'>
                    <Search
                      className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                      aria-hidden='true'
                    />
                    <Input
                      id='card-search'
                      aria-label='Filter active cards'
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder='Filter by name, member code, or shortcode'
                      className='pl-9'
                    />
                  </div>

                  {visibleActiveCards.length > 0 && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={toggleSelectAll}
                      className='text-xs text-muted-foreground'
                    >
                      {allVisibleSelected ? (
                        <>
                          <CheckSquare className='mr-1.5 size-3.5' />
                          Deselect all
                        </>
                      ) : (
                        <>
                          <Square className='mr-1.5 size-3.5' />
                          Select all ({visibleActiveCards.length})
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {allActiveCards.length > 0 && (
                  <div
                    role='group'
                    aria-label='Filter active cards by stage or scan activity'
                    className='flex flex-wrap gap-1.5'
                  >
                    {(
                      [
                        ['ALL', 'All'],
                        ['MEMBER', 'Members'],
                        ['FIRST_TIMER', 'First-timers'],
                        ['UNSCANNED', 'Never scanned'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type='button'
                        onClick={() => setActiveFilter(key)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          activeFilter === key
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <QueryState
                  loading={
                    search.trim() !== debouncedCardSearch ||
                    cardsQuery.isPending
                  }
                  error={cardsQuery.error}
                  empty={visibleActiveCards.length === 0}
                  emptyTitle={
                    search.trim() || activeFilter !== 'ALL'
                      ? 'No matching active cards'
                      : 'No active cards yet'
                  }
                  emptyDescription={
                    search.trim() || activeFilter !== 'ALL'
                      ? 'Try clearing or adjusting your filter.'
                      : 'Issued check-in cards will appear here.'
                  }
                  onRetry={() => void cardsQuery.refetch()}
                />
                {search.trim() === debouncedCardSearch &&
                  visibleActiveCards.length > 0 && (
                    <div className='divide-y rounded-xl border'>
                      {visibleActiveCards.map((card) => {
                        const isSelected = selectedCards.has(card.id)
                        const share = buildWhatsAppShare({
                          first_name: card.first_name,
                          last_name: card.last_name,
                          member_code: card.member_code,
                          short_code: card.short_code,
                          phone_e164: card.phone_e164,
                          phone: card.phone,
                        })
                        const issuedDate = formatShortDate(card.issued_at)

                        return (
                          <div
                            key={card.id}
                            className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
                              isSelected
                                ? 'bg-sky-50/50 dark:bg-sky-950/20'
                                : 'hover:bg-muted/35'
                            }`}
                          >
                            <div className='flex min-w-0 items-center gap-3'>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() =>
                                  toggleCardSelection(card.id)
                                }
                                aria-label={`Select ${card.first_name} ${card.last_name}`}
                              />
                              <div className='min-w-0 space-y-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                  <p className='truncate text-sm font-semibold text-foreground'>
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
                                <div className='flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground'>
                                  <span className='font-mono font-medium'>
                                    {card.member_code}
                                  </span>
                                  <span>·</span>
                                  <ShortCodePill code={card.short_code} />
                                  {issuedDate && (
                                    <>
                                      <span>·</span>
                                      <span>Issued {issuedDate}</span>
                                    </>
                                  )}
                                  {card.scan_count !== undefined && (
                                    <>
                                      <span>·</span>
                                      <span className='tabular-nums'>
                                        {card.scan_count} check-ins
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className='flex shrink-0 items-center gap-1.5'>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                onClick={() => setPreviewTarget(card)}
                              >
                                <Eye className='size-3.5' />
                                View
                              </Button>

                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                className='text-emerald-700 hover:text-emerald-800 dark:text-emerald-400'
                                aria-label={
                                  share.whatsappUrl
                                    ? `Send ${card.first_name} ${card.last_name} card via WhatsApp`
                                    : `Copy ${card.first_name} ${card.last_name} card details`
                                }
                                onClick={() => shareCardDetails(share)}
                              >
                                {share.whatsappUrl ? (
                                  <MessageCircle className='size-3.5' />
                                ) : (
                                  <Copy className='size-3.5' />
                                )}
                                <span className='hidden sm:inline'>
                                  {share.whatsappUrl ? 'WhatsApp' : 'Copy'}
                                </span>
                              </Button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type='button'
                                    variant='ghost'
                                    size='icon'
                                    className='size-8'
                                    aria-label={`More actions for ${card.first_name} ${card.last_name}`}
                                  >
                                    <MoreHorizontal className='size-4' />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end'>
                                  <DropdownMenuItem
                                    disabled={issue.isPending}
                                    onSelect={() =>
                                      setReplaceTarget({
                                        personId: card.person_id,
                                        name: `${card.first_name} ${card.last_name}`,
                                        memberCode: card.member_code,
                                        shortCode: card.short_code,
                                      })
                                    }
                                  >
                                    <RefreshCw className='size-4' />
                                    Replace card
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant='destructive'
                                    disabled={revoke.isPending}
                                    onSelect={() => setRevokeTarget(card)}
                                  >
                                    <ShieldX className='size-4' />
                                    Revoke card
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                    <CardTitle>Needs a card</CardTitle>
                    <CardDescription>
                      Active members and visitors who do not have a check-in
                      card yet.
                    </CardDescription>
                  </div>
                  <Badge variant='outline' className='tabular-nums'>
                    {filteredUnissued.length} waiting
                  </Badge>
                </div>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='relative max-w-md flex-1'>
                    <Search
                      className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                      aria-hidden='true'
                    />
                    <Input
                      aria-label='Filter unissued members'
                      value={unissuedSearch}
                      onChange={(event) =>
                        setUnissuedSearch(event.target.value)
                      }
                      placeholder='Filter by name or member code'
                      className='pl-9'
                    />
                  </div>
                  {filteredUnissued.length > 0 && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={toggleSelectAllUnissued}
                      className='text-xs text-muted-foreground'
                    >
                      {allVisibleUnissuedSelected ? (
                        <>
                          <CheckSquare className='mr-1.5 size-3.5' />
                          Deselect all
                        </>
                      ) : (
                        <>
                          <Square className='mr-1.5 size-3.5' />
                          Select all ({filteredUnissued.length})
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {allUnissued.length > 0 && (
                  <div
                    role='group'
                    aria-label='Filter unissued members by stage'
                    className='flex flex-wrap gap-1.5'
                  >
                    {(
                      [
                        ['ALL', 'All'],
                        ['MEMBER', 'Members'],
                        ['FIRST_TIMER', 'First-timers'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type='button'
                        onClick={() => setUnissuedFilter(key)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          unissuedFilter === key
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {filteredUnissued.length === 0 ? (
                  <div className='rounded-xl border border-dashed p-8 text-center'>
                    <CreditCard className='mx-auto size-8 text-muted-foreground/60' />
                    <h3 className='mt-3 font-semibold text-foreground'>
                      {unissuedSearch.trim() || unissuedFilter !== 'ALL'
                        ? 'No unissued members match your filter'
                        : 'All members have active cards!'}
                    </h3>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {unissuedSearch.trim() || unissuedFilter !== 'ALL'
                        ? 'Try clearing or adjusting the filter.'
                        : 'Newly registered members and first-timers appear here until a card is issued.'}
                    </p>
                  </div>
                ) : (
                  <div className='divide-y rounded-xl border'>
                    {filteredUnissued.map((person) => {
                      const isSelected = selectedUnissued.has(person.id)
                      const isIssuingThis =
                        issue.isPending && issuingPersonId === person.id
                      const registeredDate = formatShortDate(
                        person.registered_at
                      )
                      return (
                        <div
                          key={person.id}
                          className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors ${
                            isSelected
                              ? 'bg-sky-50/50 dark:bg-sky-950/20'
                              : 'hover:bg-muted/35'
                          }`}
                        >
                          <div className='flex items-center gap-3'>
                            <Checkbox
                              checked={isSelected}
                              disabled={!!batchIssueProgress}
                              onCheckedChange={() =>
                                toggleUnissuedSelection(person.id)
                              }
                              aria-label={`Select ${person.first_name} ${person.last_name}`}
                            />
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
                                {registeredDate && (
                                  <>
                                    <span>·</span>
                                    <span>Registered {registeredDate}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <Button
                            type='button'
                            size='sm'
                            disabled={issue.isPending || !!batchIssueProgress}
                            onClick={() => {
                              setIssued(null)
                              issue.mutate(person.id)
                            }}
                          >
                            <CreditCard className='size-3.5' />
                            {isIssuingThis ? 'Issuing…' : 'Issue card'}
                          </Button>
                        </div>
                      )
                    })}
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
        open={!!replaceTarget}
        onOpenChange={(open) => {
          if (!open) setReplaceTarget(null)
        }}
        isLoading={issue.isPending}
        title={
          replaceTarget
            ? `Replace card for ${replaceTarget.name}?`
            : 'Replace card?'
        }
        desc={
          replaceTarget
            ? `A new QR credential and shortcode will be generated for ${replaceTarget.memberCode}.${
                replaceTarget.shortCode
                  ? ` Their current card (${replaceTarget.shortCode}) will stop working immediately.`
                  : ''
              }`
            : ''
        }
        confirmText='Replace card'
        handleConfirm={() => {
          if (replaceTarget) {
            setIssued(null)
            issue.mutate(replaceTarget.personId)
          }
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
