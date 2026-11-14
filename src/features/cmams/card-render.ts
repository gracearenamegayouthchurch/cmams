import QRCode from 'qrcode'
import { type IssuedCard } from './types'

const cardWidth = 720
const cardHeight = 920
const qrSize = 510
const pdfWidth = 288
const pdfHeight = 368

function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(null), 600)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = src
  })
}

function fitCenteredFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  fontWeight = 'bold'
) {
  for (let size = startSize; size >= minSize; size -= 2) {
    context.font = `${fontWeight} ${size}px Inter, Arial, sans-serif`
    if (context.measureText(text).width <= maxWidth) return size
  }
  return minSize
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) =>
    char === '&'
      ? '&amp;'
      : char === '<'
        ? '&lt;'
        : char === '>'
          ? '&gt;'
          : char === '"'
            ? '&quot;'
            : '&#39;'
  )
}

async function renderCardCanvas(card: IssuedCard) {
  const canvas = document.createElement('canvas')
  canvas.width = cardWidth
  canvas.height = cardHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is not available')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, cardWidth, cardHeight)

  // Deep navy header with sky-blue accent bar
  context.fillStyle = '#0c243a'
  context.fillRect(0, 0, cardWidth, 136)
  context.fillStyle = '#0ea5e9'
  context.fillRect(0, 136, cardWidth, 6)

  const logo = await loadLogo('/images/gamyc-emblem.png')
  let textLeft = 48
  if (logo) {
    context.drawImage(logo, 40, 22, 92, 92)
    textLeft = 148
  }

  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  context.fillStyle = '#ffffff'
  context.font = 'bold 30px Inter, Arial, sans-serif'
  context.fillText('GRACE ARENA', textLeft, 68)
  context.fillStyle = '#7dd3fc'
  context.font = '600 15px Inter, Arial, sans-serif'
  context.fillText('MEGA YOUTH CHURCH', textLeft, 98)

  context.textAlign = 'right'
  context.fillStyle = '#bae6fd'
  context.font = '600 13px Inter, Arial, sans-serif'
  context.fillText('CHECK-IN CARD', cardWidth - 48, 68)

  // Framed QR container
  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, card.credential || card.shortCode, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: qrSize,
    color: { dark: '#0c243a', light: '#ffffff' },
  })
  const qrX = (cardWidth - qrSize) / 2
  const qrY = 176
  context.strokeStyle = '#e2e8f0'
  context.lineWidth = 2
  context.strokeRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24)
  context.drawImage(qrCanvas, qrX, qrY)

  // Member details & shortcode
  context.textAlign = 'center'
  if (card.memberName) {
    const nameFontSize = fitCenteredFontSize(
      context,
      card.memberName,
      cardWidth - 88,
      34,
      20
    )
    context.fillStyle = '#0c243a'
    context.font = `bold ${nameFontSize}px Inter, Arial, sans-serif`
    context.fillText(card.memberName, cardWidth / 2, 742, cardWidth - 80)

    context.fillStyle = '#475569'
    context.font = 'bold 24px Inter, Arial, sans-serif'
    context.fillText(card.memberCode, cardWidth / 2, 780, cardWidth - 80)

    context.fillStyle = '#f0f9ff'
    context.fillRect(cardWidth / 2 - 110, 796, 220, 42)
    context.strokeStyle = '#bae6fd'
    context.lineWidth = 1.5
    context.strokeRect(cardWidth / 2 - 110, 796, 220, 42)
    context.fillStyle = '#0369a1'
    context.font = 'bold 24px "Courier New", monospace'
    context.fillText(card.shortCode, cardWidth / 2, 825)
  } else {
    context.fillStyle = '#0c243a'
    context.font = 'bold 40px Inter, Arial, sans-serif'
    context.fillText(card.memberCode, cardWidth / 2, 756, cardWidth - 80)

    context.fillStyle = '#f0f9ff'
    context.fillRect(cardWidth / 2 - 116, 778, 232, 46)
    context.strokeStyle = '#bae6fd'
    context.lineWidth = 1.5
    context.strokeRect(cardWidth / 2 - 116, 778, 232, 46)
    context.fillStyle = '#0369a1'
    context.font = 'bold 26px "Courier New", monospace'
    context.fillText(card.shortCode, cardWidth / 2, 810)
  }

  context.fillStyle = '#64748b'
  context.font = '17px Inter, Arial, sans-serif'
  context.fillText('Present this card at service check-in', cardWidth / 2, 876)

  // Crisp cut border for printed sheets
  context.strokeStyle = '#cbd5e1'
  context.lineWidth = 2
  context.strokeRect(1, 1, cardWidth - 2, cardHeight - 2)

  return canvas
}

export async function renderCardPng(card: IssuedCard) {
  const canvas = await renderCardCanvas(card)
  return canvas.toDataURL('image/png')
}

function dataUrlBytes(dataUrl: string) {
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}

export async function renderCardPdf(card: IssuedCard) {
  const png = dataUrlBytes(await renderCardPng(card))
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Grace Arena card ${card.memberCode}`)
  pdf.setAuthor('Grace Arena Mega Youth Church')
  pdf.setCreator('Grace Arena CMAMS')
  const page = pdf.addPage([pdfWidth, pdfHeight])
  const image = await pdf.embedPng(png)
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: pdfWidth,
    height: pdfHeight,
  })
  return pdf.save()
}

export async function renderBatchCardsPdf(cards: IssuedCard[]) {
  if (!cards.length) throw new Error('No cards selected for batch printing')
  const { PDFDocument, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle('Grace Arena Member Cards Sheet')
  pdf.setAuthor('Grace Arena Mega Youth Church')
  pdf.setCreator('Grace Arena CMAMS')

  const a4Width = 595.28
  const a4Height = 841.89
  const cardW = 194
  const cardH = 248
  const colGap = 36
  const rowGap = 16
  const totalGridW = 2 * cardW + colGap
  const totalGridH = 3 * cardH + 2 * rowGap
  const marginX = (a4Width - totalGridW) / 2
  const marginY = (a4Height - totalGridH) / 2
  const cardsPerPage = 6

  for (let i = 0; i < cards.length; i += cardsPerPage) {
    const page = pdf.addPage([a4Width, a4Height])
    const batch = cards.slice(i, i + cardsPerPage)

    for (let slot = 0; slot < batch.length; slot++) {
      const card = batch[slot]
      const pngBytes = dataUrlBytes(await renderCardPng(card))
      const image = await pdf.embedPng(pngBytes)

      const col = slot % 2
      const row = Math.floor(slot / 2) // 0: top, 1: mid, 2: bottom
      const x = marginX + col * (cardW + colGap)
      const y = marginY + (2 - row) * (cardH + rowGap)

      // Light cutting guideline rectangle
      page.drawRectangle({
        x: x - 1,
        y: y - 1,
        width: cardW + 2,
        height: cardH + 2,
        borderWidth: 0.5,
        borderColor: rgb(0.8, 0.85, 0.9),
      })

      page.drawImage(image, {
        x,
        y,
        width: cardW,
        height: cardH,
      })
    }
  }

  return pdf.save()
}

export async function printCard(card: IssuedCard) {
  const dataUrl = await renderCardPng(card)
  const safeCode = escapeHtml(card.memberCode)
  const printWindow = window.open('', '_blank', 'width=550,height=750')
  if (!printWindow) {
    // Fallback if popups are blocked: hidden iframe
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(
        `<!DOCTYPE html><html><head><title>Print Card - ${safeCode}</title><style>@page{size:auto;margin:8mm}body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:320px;width:100%;height:auto;display:block;border-radius:8px}</style></head><body><img src="${dataUrl}" onload="window.print();" /></body></html>`
      )
      doc.close()
      setTimeout(() => iframe.remove(), 60000)
    }
    return
  }
  printWindow.document.write(
    `<!DOCTYPE html><html><head><title>Print Card - ${safeCode}</title><style>@page{size:auto;margin:8mm}body{margin:0;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc}img{max-width:340px;width:100%;height:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);border-radius:8px}@media print{body{background:transparent}img{box-shadow:none;max-width:3.2in}}</style></head><body><img src="${dataUrl}" onload="setTimeout(() => { window.print(); }, 250);" /></body></html>`
  )
  printWindow.document.close()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export type ShareCardInput = {
  first_name?: string
  last_name?: string
  memberName?: string
  member_code?: string
  memberCode?: string
  short_code?: string
  shortCode?: string
  phone_e164?: string | null
  phone?: string | null
}

function unmaskedDigits(value?: string | null) {
  if (!value || value.includes('*')) return ''
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 ? digits : ''
}

export function buildWhatsAppShare(card: ShareCardInput) {
  const name =
    card.memberName ||
    [card.first_name, card.last_name].filter(Boolean).join(' ') ||
    'Beloved Member'
  const memberCode = card.member_code || card.memberCode || ''
  const shortCode = card.short_code || card.shortCode || ''
  const rawPhone =
    unmaskedDigits(card.phone_e164) || unmaskedDigits(card.phone)

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
