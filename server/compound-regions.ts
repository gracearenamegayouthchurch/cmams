import { z } from 'zod'

export const COMPOUND_REGIONS = [
  { code: 'ACROSS', label: 'Across' },
  { code: 'NDAR', label: 'Ndar' },
  { code: 'CHIKAM', label: 'Chikam' },
  { code: 'HOSTEL', label: 'Hostel' },
] as const

export type CompoundRegion = (typeof COMPOUND_REGIONS)[number]['code']

export const compoundRegion = z.enum([
  'ACROSS',
  'NDAR',
  'CHIKAM',
  'HOSTEL',
])

export function regionLabel(code: string) {
  return COMPOUND_REGIONS.find((region) => region.code === code)?.label ?? code
}

/** Matches the database generated column used for duplicate detection. */
export function normalizeCompoundName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}
