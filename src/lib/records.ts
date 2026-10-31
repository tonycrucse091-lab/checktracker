import type {
  AuditLog,
  CheckRecord,
  CheckStatus,
  CheckStatusHistory,
  DashboardSummary,
  PagedRecords,
  RecordFilters,
  RecordSubmission,
  RecordSortField,
} from './types'
import { requireSupabase } from './supabase'

const PAGE_SIZE_DEFAULT = 10
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sortFields: readonly RecordSortField[] = [
  'created_at',
  'updated_at',
  'expected_processing_date',
  'issue_date',
  'amount',
  'status',
]

function ensureSuccess(error: unknown): void {
  if (error) throw error
}

async function countRecords(status?: CheckStatus, after?: string): Promise<number> {
  const client = requireSupabase()
  let query = client.from('check_records').select('id', { count: 'exact', head: true }).is('archived_at', null)
  if (status) query = query.eq('status', status)
  if (after) query = query.gte('updated_at', after)
  const { count, error } = await query
  ensureSuccess(error)
  return count ?? 0
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const client = requireSupabase()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [total, pending, processing, cleared, returned, on_hold, updatedThisWeek] = await Promise.all([
    countRecords(),
    countRecords('pending'),
    countRecords('processing'),
    countRecords('cleared'),
    countRecords('returned'),
    countRecords('on_hold'),
    countRecords(undefined, weekAgo),
  ])
  const { data: records, error: recordsError } = await client
    .from('check_records')
    .select('*')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(7)
  ensureSuccess(recordsError)

  const { data: history, error: historyError } = await client
    .from('check_status_history')
    .select('id,check_record_id,previous_status,new_status,actor_user_id,reason,verification_source,verification_timestamp,created_at,check_records(tracking_reference)')
    .order('created_at', { ascending: false })
    .limit(6)
  ensureSuccess(historyError)

  return {
    total,
    pending,
    processing,
    cleared,
    returned,
    on_hold,
    updatedThisWeek,
    recentRecords: (records ?? []) as CheckRecord[],
    recentHistory: (history ?? []) as DashboardSummary['recentHistory'],
  }
}

export async function fetchRecords(filters: RecordFilters = {}): Promise<PagedRecords> {
  const client = requireSupabase()
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? PAGE_SIZE_DEFAULT))
  const sortBy = sortFields.includes(filters.sortBy ?? 'updated_at') ? (filters.sortBy ?? 'updated_at') : 'updated_at'
  const ascending = filters.sortDirection === 'asc'
  const start = (page - 1) * pageSize
  const end = start + pageSize - 1
  let query = client.from('check_records').select('*', { count: 'exact' })

  if (!filters.includeArchived) query = query.is('archived_at', null)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.currency && filters.currency !== 'all') query = query.eq('currency', filters.currency.toUpperCase())
  if (filters.staffUserId && filters.staffUserId !== 'all') query = query.eq('created_by', filters.staffUserId)
  if (filters.fromDate) query = query.gte('issue_date', filters.fromDate)
  if (filters.toDate) query = query.lte('issue_date', filters.toDate)
  const search = filters.search?.trim().slice(0, 100)
  if (search) {
    if (UUID_PATTERN.test(search)) query = query.eq('id', search)
    else query = query.ilike('tracking_reference', `%${search.replace(/[%_]/g, '\\$&')}%`)
  }

  const { data, count, error } = await query
    .order(sortBy, { ascending, nullsFirst: false })
    .range(start, end)
  ensureSuccess(error)

  return {
    records: (data ?? []) as CheckRecord[],
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function fetchCheckRecord(id: string): Promise<CheckRecord> {
  const { data, error } = await requireSupabase().from('check_records').select('*').eq('id', id).single()
  ensureSuccess(error)
  if (!data) throw new Error('Record not found.')
  return data as CheckRecord
}

export async function fetchRecordHistory(recordId: string): Promise<CheckStatusHistory[]> {
  const { data, error } = await requireSupabase()
    .from('check_status_history')
    .select('*')
    .eq('check_record_id', recordId)
    .order('created_at', { ascending: false })
  ensureSuccess(error)
  return (data ?? []) as CheckStatusHistory[]
}

export async function createCheckRecord(input: RecordSubmission): Promise<CheckRecord> {
  const { data, error } = await requireSupabase().from('check_records').insert(input).select('*').single()
  ensureSuccess(error)
  return data as CheckRecord
}

export async function updateCheckRecord(id: string, input: RecordSubmission): Promise<CheckRecord> {
  const { data, error } = await requireSupabase().from('check_records').update(input).eq('id', id).select('*').single()
  ensureSuccess(error)
  return data as CheckRecord
}

export async function updateCheckStatus(id: string, status: CheckStatus, reason: string | null): Promise<CheckRecord> {
  const { data, error } = await requireSupabase().rpc('set_check_status', {
    p_record_id: id,
    p_new_status: status,
    p_reason: reason,
  })
  ensureSuccess(error)
  return data as CheckRecord
}

export async function archiveCheckRecord(id: string): Promise<CheckRecord> {
  const { data, error } = await requireSupabase().rpc('archive_check_record', { p_record_id: id })
  ensureSuccess(error)
  return data as CheckRecord
}

export async function fetchAuditLogs(page = 1, pageSize = 25): Promise<{ rows: AuditLog[]; total: number }> {
  const start = (Math.max(1, page) - 1) * pageSize
  const { data, count, error } = await requireSupabase()
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(start, start + pageSize - 1)
  ensureSuccess(error)
  return { rows: (data ?? []) as AuditLog[], total: count ?? 0 }
}
