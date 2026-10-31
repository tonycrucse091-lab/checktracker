/// <reference path="../deno-globals.d.ts" />
import { type SupabaseClient } from '@supabase/supabase-js'
import {
  corsHeadersFor,
  corsPreflight,
  handleError,
  HttpError,
  jsonResponse,
  requireActor,
  writeAuditEvent,
  writeDeniedEvent,
} from '../_shared/security.ts'

import { csvCell } from '../_shared/csv.ts'

const STATUSES = ['draft', 'issued', 'pending', 'processing', 'on_hold', 'cleared', 'returned', 'cancelled'] as const
const SORT_FIELDS = ['created_at', 'updated_at', 'expected_processing_date', 'issue_date', 'amount', 'status'] as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPORT_COLUMNS = ['id', 'tracking_reference', 'payee_label', 'amount', 'currency', 'issue_date', 'expected_processing_date', 'status', 'notes', 'created_at', 'updated_at'] as const
const MAX_ROWS = 10_000
const BATCH_SIZE = 1_000

type CheckStatus = 'draft' | 'issued' | 'pending' | 'processing' | 'on_hold' | 'cleared' | 'returned' | 'cancelled'

type ExportFilters = {
  search?: string
  status?: CheckStatus | 'all'
  currency?: string | 'all'
  staffUserId?: string | 'all'
  fromDate?: string
  toDate?: string
  sortBy?: (typeof SORT_FIELDS)[number]
  sortDirection?: 'asc' | 'desc'
  includeArchived?: boolean
}

type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string | number | null>

function parseFilters(value: unknown): ExportFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'The export filters are invalid.')
  const input = value as Record<string, unknown>
  const filters: ExportFilters = {}
  if (typeof input.search === 'string' && input.search.trim()) {
    const search = input.search.trim()
    if (search.length > 100) throw new HttpError(400, 'Search must be 100 characters or fewer.')
    if (!/^[A-Za-z0-9._/-]+$/.test(search)) {
      throw new HttpError(400, 'Search by ID or tracking reference using letters, numbers, dots, underscores, slashes, or hyphens.')
    }
    filters.search = search
  }
  if (typeof input.status === 'string' && input.status !== 'all') {
    if (!STATUSES.includes(input.status as (typeof STATUSES)[number])) throw new HttpError(400, 'Choose a valid record status.')
    filters.status = input.status as CheckStatus
  }
  if (typeof input.currency === 'string' && input.currency !== 'all' && input.currency !== '') {
    const currency = input.currency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'Enter a three-letter currency code.')
    filters.currency = currency
  }
  if (typeof input.staffUserId === 'string' && input.staffUserId !== 'all' && input.staffUserId !== '') {
    if (!UUID_PATTERN.test(input.staffUserId)) throw new HttpError(400, 'The selected staff member is invalid.')
    filters.staffUserId = input.staffUserId
  }
  if (typeof input.fromDate === 'string' && input.fromDate) {
    if (!isValidIsoDate(input.fromDate)) throw new HttpError(400, 'Enter a valid start date.')
    filters.fromDate = input.fromDate
  }
  if (typeof input.toDate === 'string' && input.toDate) {
    if (!isValidIsoDate(input.toDate)) throw new HttpError(400, 'Enter a valid end date.')
    filters.toDate = input.toDate
  }
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) throw new HttpError(400, 'The start date must be on or before the end date.')
  if (typeof input.sortBy === 'string') {
    if (!SORT_FIELDS.includes(input.sortBy as (typeof SORT_FIELDS)[number])) throw new HttpError(400, 'Choose a valid sort field.')
    filters.sortBy = input.sortBy as (typeof SORT_FIELDS)[number]
  }
  if (typeof input.sortDirection === 'string') {
    if (input.sortDirection !== 'asc' && input.sortDirection !== 'desc') throw new HttpError(400, 'Choose a valid sort direction.')
    filters.sortDirection = input.sortDirection
  }
  if (input.includeArchived !== undefined && typeof input.includeArchived !== 'boolean') throw new HttpError(400, 'The archive filter is invalid.')
  filters.includeArchived = input.includeArchived === true
  return filters
}

async function readFilters(request: Request): Promise<ExportFilters> {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > 10_000) throw new HttpError(413, 'The export filters are too large.')
  try {
    return parseFilters(await request.json())
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'The export filters are not valid JSON.')
  }
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function makeQuery(client: SupabaseClient, filters: ExportFilters, from: number, to: number) {
  let query = client.from('check_records').select(EXPORT_COLUMNS.join(','))
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.currency) query = query.eq('currency', filters.currency)
  if (filters.staffUserId) query = query.eq('created_by', filters.staffUserId)
  if (filters.fromDate) query = query.gte('issue_date', filters.fromDate)
  if (filters.toDate) query = query.lte('issue_date', filters.toDate)
  if (!filters.includeArchived) query = query.is('archived_at', null)
  if (filters.search) {
    const term = filters.search
    const escaped = term.replaceAll('%', '\\%').replaceAll('_', '\\_')
    const searchFilter = UUID_PATTERN.test(term)
      ? `tracking_reference.ilike.%${escaped}%,id.eq.${term}`
      : `tracking_reference.ilike.%${escaped}%`
    query = query.or(searchFilter)
  }
  return query.order(filters.sortBy ?? 'updated_at', { ascending: filters.sortDirection === 'asc' }).range(from, to)
}

function toCsv(rows: ExportRow[]): string {
  const header = EXPORT_COLUMNS.map(csvCell).join(',')
  const body = rows.map((row) => EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(',')).join('\r\n')
  return `\uFEFF${header}${body ? `\r\n${body}` : ''}\r\n`
}

async function readExportRows(client: SupabaseClient, filters: ExportFilters): Promise<ExportRow[]> {
  const rows: ExportRow[] = []
  for (let offset = 0; offset <= MAX_ROWS; offset += BATCH_SIZE) {
    const isLimitCheck = offset === MAX_ROWS
    const batchSize = isLimitCheck ? 1 : Math.min(BATCH_SIZE, MAX_ROWS - offset)
    const { data, error } = await makeQuery(client, filters, offset, offset + batchSize - 1)
    if (error) throw new HttpError(503, 'Records could not be prepared for export. Check the filters and try again.')
    const batch = (data ?? []) as unknown as ExportRow[]
    if (isLimitCheck && batch.length) throw new HttpError(413, 'This report exceeds the 10,000-row export limit. Apply additional filters and try again.')
    rows.push(...batch)
    if (batch.length < batchSize) break
  }
  return rows
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return corsPreflight(request)
  const cors = corsHeadersFor(request)
  if (!cors) return jsonResponse({ message: 'Origin not allowed.' }, 403, { 'Cache-Control': 'no-store' })
  if (request.method !== 'POST') return jsonResponse({ message: 'Use POST for this action.' }, 405, cors)

  try {
    const actor = await requireActor(request)
    const filters = await readFilters(request)
    if (filters.includeArchived && actor.profile.role !== 'administrator') {
      await writeDeniedEvent(actor, 'export_archived_records')
      throw new HttpError(403, 'Only administrators may export archived records.')
    }

    const { data: allowed, error: permissionError } = await actor.userClient.rpc('can_export_records')
    if (permissionError) throw new HttpError(503, 'Export permissions could not be checked. Try again later.')
    if (!allowed) {
      await writeDeniedEvent(actor, 'record_export')
      throw new HttpError(403, 'Your account is not authorized to export records.')
    }
    if (actor.profile.role === 'administrator' && actor.aal !== 'aal2') {
      await writeDeniedEvent(actor, 'record_export_without_aal2')
      throw new HttpError(403, 'Complete administrator multi-factor verification before exporting.')
    }

    const rows = await readExportRows(actor.userClient, filters)
    await writeAuditEvent(actor, 'report.exported', 'report_export', null, {
      row_count: rows.length,
      status: filters.status ?? null,
      currency: filters.currency ?? null,
      date_filter_used: Boolean(filters.fromDate || filters.toDate),
      staff_filter_used: Boolean(filters.staffUserId),
      search_filter_used: Boolean(filters.search),
      archived_included: filters.includeArchived === true,
      sort_by: filters.sortBy ?? 'updated_at',
    })

    const today = new Date().toISOString().slice(0, 10)
    return new Response(toCsv(rows), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="checktrack-report-${today}.csv"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return handleError(error, cors)
  }
})
