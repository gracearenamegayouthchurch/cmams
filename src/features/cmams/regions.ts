export const REGIONS = [
  { code: 'ACROSS', label: 'Across' },
  { code: 'NDAR', label: 'Ndar' },
  { code: 'CHIKAM', label: 'Chikam' },
  { code: 'HOSTEL', label: 'Hostel' },
] as const

export function regionLabel(code: string) {
  return REGIONS.find((region) => region.code === code)?.label ?? code
}
