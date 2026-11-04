import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { HostelLocationFields } from './hostel-location-fields'

afterEach(async () => {
  await cleanup()
})

it('filters buildings by hostel and clears the previous choice when hostel changes', async () => {
  function Fixture() {
    const [value, setValue] = useState('')
    return (
      <>
        <HostelLocationFields prefix='test' value={value} onChange={setValue} />
        <output data-testid='selected-hostel'>{value}</output>
        <button
          type='button'
          onClick={() => setValue('Girls Hostel — New Tetfund')}
        >
          Load saved hostel
        </button>
      </>
    )
  }
  render(<Fixture />)
  await userEvent.click(page.getByRole('combobox', { name: 'Hostel' }))
  await userEvent.click(page.getByRole('option', { name: 'Boys Hostel' }))
  await userEvent.click(page.getByRole('combobox', { name: 'Building' }))
  await expect
    .element(page.getByRole('option', { name: 'Chalet' }))
    .toBeVisible()
  expect(page.getByRole('option', { name: 'Tetfund' }).elements()).toHaveLength(
    0
  )
  await userEvent.click(page.getByRole('option', { name: 'Chalet' }))
  await expect
    .element(page.getByTestId('selected-hostel'))
    .toHaveTextContent('Boys Hostel — Chalet')
  await userEvent.click(page.getByRole('combobox', { name: 'Hostel' }))
  await userEvent.click(page.getByRole('option', { name: 'Girls Hostel' }))
  await expect
    .element(page.getByTestId('selected-hostel'))
    .toHaveTextContent('')
  await userEvent.click(page.getByRole('combobox', { name: 'Building' }))
  await expect
    .element(page.getByRole('option', { name: 'New Tetfund' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('option', { name: 'Tetfund', exact: true }))
    .toBeVisible()
  expect(
    page.getByRole('option', { name: 'Needs Assessment' }).elements()
  ).toHaveLength(0)
  await userEvent.keyboard('{Escape}')
  await userEvent.click(page.getByRole('button', { name: 'Load saved hostel' }))
  await expect
    .element(page.getByRole('combobox', { name: 'Building' }))
    .toHaveTextContent('New Tetfund')
})
