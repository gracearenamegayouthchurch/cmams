import QRCode from 'qrcode'
import { type IssuedCard } from './types'

const cardWidth = 720
const cardHeight = 920
const qrSize = 550
const pdfWidth = 288
const pdfHeight = 368

async function renderCardCanvas(card: IssuedCard) {
  const canvas = document.createElement('canvas')
  canvas.width = cardWidth
  canvas.height = cardHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is not available')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, cardWidth, cardHeight)
  context.fillStyle = '#0c243a'
  context.fillRect(0, 0, cardWidth, 120)
  context.fillStyle = '#ffffff'
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.font = 'bold 31px Arial, sans-serif'
  context.fillText('GRACE ARENA', 45, 74)

  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, card.credential, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: qrSize,
    color: { dark: '#0c243a', light: '#ffffff' },
  })
  context.drawImage(qrCanvas, 85, 165)

  context.textAlign = 'center'
  context.fillStyle = '#0c243a'
  context.font = 'bold 42px Arial, sans-serif'
  context.fillText(card.memberCode, cardWidth / 2, 770)
  context.font = '34px Arial, sans-serif'
  context.fillText(card.shortCode, cardWidth / 2, 830)
  context.fillStyle = '#485f70'
  context.font = '18px Arial, sans-serif'
  context.fillText('Present this card at check-in', cardWidth / 2, 878)
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
