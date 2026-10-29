import '@/styles/index.css'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'

it('keeps a tall card preview navigable on a phone viewport', async () => {
  await page.viewport(390, 844)
  const screen = await render(
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <button type='button'>Back to cards</button>
          <DialogTitle>Member check-in card</DialogTitle>
          <DialogDescription>Card preview</DialogDescription>
        </DialogHeader>
        <div style={{ height: 1100 }}>Card details</div>
        <DialogFooter>
          <button type='button'>Close preview</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const dialog = screen.getByRole('dialog').element() as HTMLElement
  const back = screen.getByRole('button', { name: 'Back to cards' }).element()
  const bounds = dialog.getBoundingClientRect()
  const backBounds = back.getBoundingClientRect()

  expect(getComputedStyle(dialog).position).toBe('fixed')
  expect(bounds.top).toBeGreaterThanOrEqual(0)
  expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight)
  expect(backBounds.top).toBeGreaterThanOrEqual(0)
  expect(backBounds.bottom).toBeLessThanOrEqual(window.innerHeight)

  dialog.scrollTop = dialog.scrollHeight
  await expect
    .poll(() => {
      const footer = screen
        .getByRole('button', { name: 'Close preview' })
        .element()
      const footerBounds = footer.getBoundingClientRect()
      return footerBounds.top >= 0 && footerBounds.bottom <= window.innerHeight
    })
    .toBe(true)
})
