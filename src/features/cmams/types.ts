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
  registered_at?: string
  attendance_count?: number
  last_attended_at?: string | null
  household_id?: string
  score?: number
  shared_phone?: boolean
}

export type PaginatedPeople = {
  people: Person[]
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
}

export type PersonAttendanceRecord = {
  id: string
  service_id: string
  service_name: string
  service_category: string
  scheduled_start_at: string
  checked_in_at: string
  checkin_method: string
  snapshot_stage: string
}

export type Summary = {
  id: string
  name: string
  status: string
  scheduled_start_at?: string
  total: number
  members: number
  first_timers: number
  returning_visitors: number
  eligible: number
  turnoutPercent: number
}

export type AnalyticsBreakdown = {
  id: string
  name: string
  members: number
  attendees: number
  turnoutPercent: number
}

export type AnalyticsCell = AnalyticsBreakdown & {
  region: string
}

export type AnalyticsTrendPoint = {
  id: string
  name: string
  date: string
  total: number
  members: number
  firstTimers: number
  returningVisitors: number
}

export type AnalyticsAbsentee = {
  id: string
  member_code: string
  first_name: string
  last_name: string
  cell_name: string | null
  last_attended_at: string | null
}

export type AnalyticsReport = {
  service: {
    id: string
    name: string
    status: string
    scheduled_start_at: string
  }
  summary: {
    total: number
    members: number
    first_timers: number
    returning_visitors: number
    eligible: number
    turnoutPercent: number
  }
  trend: AnalyticsTrendPoint[]
  cells: AnalyticsCell[]
  unassigned: {
    members: number
    attendees: number
  }
  departments: AnalyticsBreakdown[]
  absentees: AnalyticsAbsentee[]
  latestSunday: {
    id: string
    name: string
    date: string
  } | null
}

export type IssuedCard = {
  memberCode: string
  shortCode: string
  credential: string
}


export type FirstTimerPerson = {
  id: string
  member_code: string
  first_name: string
  middle_name: string | null
  last_name: string
  phone: string | null
  email: string | null
  lifecycle_stage: string
  registered_at: string
  room: string | null
  birth_month: number | null
  birth_day: number | null
  birth_year: number | null
  compound_name: string | null
  compound_region: string | null
  cell_id: string | null
  cell_name: string | null
  cell_region: string | null
  departments: string[]
  attendance_count: number
  first_attended_at: string | null
  last_attended_at: string | null
  first_service_name: string | null
}

export type FirstTimersResponse = {
  summary: {
    activeFirstTimers: number
    newThisMonth: number
    promotedCount: number
    unassignedCellCount: number
    totalTracked: number
  }
  people: FirstTimerPerson[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
