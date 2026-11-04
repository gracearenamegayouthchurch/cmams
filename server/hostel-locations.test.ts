import { expect, it } from 'vitest'
import { HOSTEL_BUILDINGS, hostelName, parseHostelName, isValidHostelName } from './hostel-locations.js'

it('keeps boys and girls hostels distinct and limits their buildings', () => {
  expect(HOSTEL_BUILDINGS['Boys Hostel']).toEqual(['Chalet'])
  expect(HOSTEL_BUILDINGS['Girls Hostel']).toEqual(['New Tetfund', 'Tetfund', 'Chalet'])
  expect(hostelName('Boys Hostel', 'Chalet')).toBe('Boys Hostel — Chalet')
  expect(parseHostelName('Girls Hostel — Chalet')).toEqual({ category: 'Girls Hostel', building: 'Chalet' })
  expect(parseHostelName('Boys Hostel — Tetfund')).toBeNull()
  expect(isValidHostelName('Girls Hostel — Needs Assessment')).toBe(false)
  expect(isValidHostelName('Hostel')).toBe(false)
})
