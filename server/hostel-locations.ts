/** Shared, explicit location choices. No gender is inferred from a person's profile. */
export const HOSTEL_BUILDINGS = {
  'Boys Hostel': ['Chalet'],
  'Girls Hostel': ['New Tetfund', 'Tetfund', 'Chalet'],
} as const

export type HostelCategory = keyof typeof HOSTEL_BUILDINGS

export function hostelName(category: HostelCategory, building: string): string {
  return `${category} — ${building}`
}

export function parseHostelName(value: string): { category: HostelCategory; building: string } | null {
  for (const category of Object.keys(HOSTEL_BUILDINGS) as HostelCategory[]) {
    for (const building of HOSTEL_BUILDINGS[category]) {
      if (value === hostelName(category, building)) return { category, building }
    }
  }
  return null
}

export function isValidHostelName(value: string): boolean {
  return parseHostelName(value) !== null
}
