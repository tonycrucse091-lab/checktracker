export type UserRole = 'administrator' | 'staff' | 'read_only'
export type AccountStatus = 'active' | 'suspended' | 'disabled'
export type CheckStatus =
  | 'draft'
  | 'issued'
  | 'pending'
  | 'processing'
  | 'on_hold'
  | 'cleared'
  | 'returned'
  | 'cancelled'

export interface Profile {
  user_id: string
  display_name: string
  role: UserRole
  account_status: AccountStatus
  can_export_records: boolean
  created_at: string
  updated_at: string
}

export interface CheckRecord {
  id: string
  tracking_reference: string
  payee_label: string
  amount: number | string
  currency: string
  issue_date: string
  expected_processing_date: string
  status: CheckStatus
  notes: string | null
  verification_source: string | null
  verification_timestamp: string | null
  current_location?: string | null
  location_updated_at?: string | null
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string
  archived_at: string | null
}

export interface CheckStatusHistory {
  id: string
  check_record_id: string
  previous_status: CheckStatus | null
  new_status: CheckStatus
  actor_user_id: string | null
  reason: string | null
  verification_source: string | null
  verification_timestamp: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_user_id: string | null
  action: string
  resource_type: 'profile' | 'check_record' | 'check_status_history' | 'report_export' | 'security_event'
  resource_id: string | null
  minimized_metadata: Record<string, unknown>
  created_at: string
}

export interface RecordSubmission {
  tracking_reference: string
  payee_label: string
  amount: number
  currency: string
  issue_date: string
  expected_processing_date: string
  notes: string | null
}

export type RecordSortField =
  | 'created_at'
  | 'updated_at'
  | 'expected_processing_date'
  | 'issue_date'
  | 'amount'
  | 'status'

export interface RecordFilters {
  search?: string
  status?: CheckStatus | 'all'
  currency?: string | 'all'
  staffUserId?: string | 'all'
  fromDate?: string
  toDate?: string
  sortBy?: RecordSortField
  sortDirection?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  includeArchived?: boolean
}

export interface PagedRecords {
  records: CheckRecord[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardSummary {
  total: number
  pending: number
  processing: number
  cleared: number
  returned: number
  on_hold: number
  updatedThisWeek: number
  recentRecords: CheckRecord[]
  recentHistory: Array<CheckStatusHistory & { check_records?: { tracking_reference: string } | Array<{ tracking_reference: string }> | null }>
}

export interface TeamMember extends Profile {
  email: string
  email_confirmed_at: string | null
  last_sign_in_at: string | null
}
