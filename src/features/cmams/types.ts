export type Service = {
  id: string
  name: string
  category: string
  status: 'SCHEDULED' | 'CHECKIN_OPEN' | 'CHECKIN_CLOSED' | 'CANCELLED'
  scheduled_start_at: string
  checkin_opens_at: string
  checkin_closes_at: string
  locked_eligible_member_count: number | null
}
export type Person = {
  id: string
  member_code: string
  first_name: string
  last_name: string
  phone: string | null
  lifecycle_stage: string
  household_id?: string
  score?: number
  shared_phone?: boolean
}
export type Summary = {
  id: string
  name: string
  status: string
  total: number
  members: number
  first_timers: number
  returning_visitors: number
  eligible: number
  turnoutPercent: number
}
export type IssuedCard = {
  memberCode: string
  shortCode: string
  png: string
  pdf: string
}
