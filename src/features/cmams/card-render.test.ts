import { describe, expect, it } from 'vitest'
import { renderCardPdf, renderCardPng } from './card-render'

const card = {
  memberCode: 'CM-1001',
  shortCode: '9K4-M7X',
  credential: `cma://v1/${'A'.repeat(22)}`,
}

describe('browser card rendering', () => {
  it('renders a PNG preview and a printable PDF without a server renderer', async () => {
    const png = await renderCardPng(card)
    expect(png).toMatch(/^data:image\/png;base64,/)
    const pdf = await renderCardPdf(card)
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe('%PDF-')
  })
})
