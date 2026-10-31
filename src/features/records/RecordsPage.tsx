import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ArrowDownToLine, ArrowDownWideNarrow, ArrowUpDown, ArrowUpWideNarrow, FilePlus2, Search, SlidersHorizontal, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '../layout/AppShell'
import { useAuth } from '../auth/AuthContext'
import { archiveCheckRecord, fetchRecords } from '../../lib/records'
import type { CheckRecord, CheckStatus, RecordFilters, RecordSortField, UserRole } from '../../lib/types'
import { formatCurrency, formatDate, formatDateTime, roleLabels, statusLabels } from '../../lib/format'
import { checkStatuses } from '../../lib/validation'
import StatusBadge from '../../components/ui/StatusBadge'
import { EmptyState, LoadError, PageLoading } from '../../components/ui/States'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { Button } from '../../components/ui/Button'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { downloadBlob, requestRecordExport } from '../../lib/exports'
import { loadTeamMembers } from '../../lib/user-management'
import { logSafeFailure } from '../../lib/errors'

const pageSizes = [10, 20, 50]
const statusSortLabels: Record<string, string> = { ...statusLabels, all: 'All statuses' }

type SortableHeaderProps = { label: string; field: RecordSortField; current: RecordSortField; direction: 'asc' | 'desc'; onSort: (field: RecordSortField) => void }
function SortableHeader({ label, field, current, direction, onSort }: SortableHeaderProps) {
  const active = current === field
  const Icon = active ? direction === 'asc' ? ArrowUpWideNarrow : ArrowDownWideNarrow : ArrowUpDown
  return <button className="sort-button" type="button" onClick={() => onSort(field)} aria-label={`Sort by ${label}${active ? `, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}`} aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{label}<Icon aria-hidden="true" /></button>
}

function canManage(role: UserRole | undefined): boolean { return role === 'administrator' || role === 'staff' }

export default function RecordsPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStatus = searchParams.get('status')
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [status, setStatus] = useState(checkStatuses.includes(initialStatus as CheckStatus) ? initialStatus as CheckStatus : 'all')
  const [currency, setCurrency] = useState('all')
  const [staffUserId, setStaffUserId] = useState('all')
  const [fromDate, setFromDate] = useState(searchParams.get('fromDate') ?? '')
  const [toDate, setToDate] = useState(searchParams.get('toDate') ?? '')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [sortBy, setSortBy] = useState<RecordSortField>('updated_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [records, setRecords] = useState<CheckRecord[]>([])
  const [total, setTotal] = useState(0)
  const [staffNames, setStaffNames] = useState<Array<{ id: string; name: string; role: UserRole }>>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [archiveTarget, setArchiveTarget] = useState<CheckRecord | null>(null)
  const [archiving, setArchiving] = useState(false)
  const debouncedSearch = useDebouncedValue(search, 250)

  const filters = useMemo<RecordFilters>(() => ({
    search: debouncedSearch || undefined,
    status: status as RecordFilters['status'],
    currency: currency === 'all' ? undefined : currency.toUpperCase(),
    staffUserId,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    sortBy,
    sortDirection,
    page,
    pageSize,
    includeArchived: profile?.role === 'administrator' && includeArchived,
  }), [debouncedSearch, status, currency, staffUserId, fromDate, toDate, sortBy, sortDirection, page, pageSize, profile?.role, includeArchived])

  const load = useCallback(async () => {
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      setRecords([])
      setTotal(0)
      setError(new Error('Start date cannot be after end date.'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRecords(filters)
      setRecords(result.records)
      setTotal(result.total)
    } catch (caught) {
      setError(caught)
      logSafeFailure('record list', caught)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [load, refreshKey])

  useEffect(() => {
    if (profile?.role !== 'administrator') return
    let alive = true
    void loadTeamMembers().then((members) => {
      if (alive) setStaffNames(members.map((member) => ({ id: member.user_id, name: member.display_name || member.email, role: member.role })))
    }).catch((caught) => {
      logSafeFailure('staff filter options', caught)
    })
    return () => { alive = false }
  }, [profile?.role])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (search.trim()) next.set('search', search.trim())
    else next.delete('search')
    if (status !== 'all') next.set('status', status)
    else next.delete('status')
    if (fromDate) next.set('fromDate', fromDate)
    else next.delete('fromDate')
    if (toDate) next.set('toDate', toDate)
    else next.delete('toDate')
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [search, status, fromDate, toDate, searchParams, setSearchParams])

  function changeSort(field: RecordSortField) {
    setPage(1)
    if (field === sortBy) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
    else {
      setSortBy(field)
      setSortDirection(field === 'amount' || field === 'status' ? 'asc' : 'desc')
    }
  }

  function clearFilters() {
    setSearch('')
    setStatus('all')
    setCurrency('all')
    setStaffUserId('all')
    setFromDate('')
    setToDate('')
    setIncludeArchived(false)
    setPage(1)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await requestRecordExport(filters)
      downloadBlob(blob, `checktrack-records-${new Date().toISOString().slice(0, 10)}.csv`)
      toast.success('Authorized CSV export downloaded.')
    } catch (caught) {
      logSafeFailure('CSV export', caught)
      toast.error(caught instanceof Error ? caught.message : 'The export could not be completed.')
    } finally {
      setExporting(false)
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      await archiveCheckRecord(archiveTarget.id)
      toast.success(`Record ${archiveTarget.tracking_reference} archived.`)
      setArchiveTarget(null)
      setRefreshKey((value) => value + 1)
    } catch (caught) {
      logSafeFailure('record archive', caught)
      toast.error(caught instanceof Error ? caught.message : 'This record could not be archived.')
    } finally {
      setArchiving(false)
    }
  }

  const canExport = profile?.role === 'administrator' || profile?.can_export_records === true
  const canCreate = canManage(profile?.role)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const firstRow = total ? (page - 1) * pageSize + 1 : 0
  const lastRow = Math.min(page * pageSize, total)
  const filterCount = [search.trim(), status !== 'all', currency !== 'all', staffUserId !== 'all', fromDate, toDate, includeArchived].filter(Boolean).length

  return (
    <>
      <PageHeader eyebrow="Records" title="Check records" description="Search and review authorized records. Status and history reflect what staff recorded, not independent payment confirmation." actions={<>
        {canExport && <Button variant="secondary" type="button" onClick={() => void handleExport()} disabled={exporting || loading}><ArrowDownToLine aria-hidden="true" />{exporting ? 'Preparing…' : 'Export CSV'}</Button>}
        {canCreate && <Link className="button button-primary" to="/app/records/new"><FilePlus2 aria-hidden="true" />Create record</Link>}
      </>} />

      <section className="toolbar" aria-label="Record search and filters">
        <label className="search-box"><Search aria-hidden="true" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search ID or tracking reference" aria-label="Search record ID or tracking reference" /></label>
        <label><span className="sr-only">Filter by status</span><select className="filter-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} aria-label="Filter by status"><option value="all">All statuses</option>{checkStatuses.map((item) => <option key={item} value={item}>{statusSortLabels[item]}</option>)}</select></label>
        <label><span className="sr-only">Filter by currency</span><input className="filter-select" style={{ width: 98 }} value={currency === 'all' ? '' : currency} onChange={(event) => { const next = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); setCurrency(next || 'all'); setPage(1) }} placeholder="Currency" aria-label="Filter by ISO currency code" maxLength={3} /></label>
        <label><span className="sr-only">Issue date from</span><input className="filter-select" type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1) }} aria-label="Issue date from" /></label>
        <label><span className="sr-only">Issue date to</span><input className="filter-select" type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1) }} aria-label="Issue date to" /></label>
        {profile?.role === 'administrator' && <label><span className="sr-only">Filter by staff member</span><select className="filter-select" value={staffUserId} onChange={(event) => { setStaffUserId(event.target.value); setPage(1) }} aria-label="Filter by staff member"><option value="all">All team members</option>{staffNames.map((person) => <option key={person.id} value={person.id}>{person.name} · {roleLabels[person.role]}</option>)}</select></label>}
        {profile?.role !== 'administrator' && profile && <label><span className="sr-only">Filter by creator</span><select className="filter-select" value={staffUserId} onChange={(event) => { setStaffUserId(event.target.value); setPage(1) }} aria-label="Filter by creator"><option value="all">All authorized records</option><option value={profile.user_id}>Created by me</option></select></label>}
        {profile?.role === 'administrator' && <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#666c68', fontSize: 11 }}><input type="checkbox" checked={includeArchived} onChange={(event) => { setIncludeArchived(event.target.checked); setPage(1) }} />Include archived</label>}
        {filterCount > 0 && <Button variant="quiet" size="small" type="button" onClick={clearFilters}><X aria-hidden="true" />Clear</Button>}
        <span className="field-hint" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}><SlidersHorizontal aria-hidden="true" size={13} />{filterCount ? `${filterCount} active filters` : 'Filter and sort'}</span>
      </section>

      {fromDate && toDate && fromDate > toDate && <div className="alert alert-error" role="alert" style={{ marginBottom: 13 }}>Start date cannot be after end date.</div>}
      {error && !(fromDate && toDate && fromDate > toDate) && <div style={{ marginBottom: 13 }}><LoadError error={error} onRetry={() => setRefreshKey((value) => value + 1)} label="Records could not be loaded." /></div>}

      <section className="surface-card table-card" aria-label="Check records" aria-busy={loading}>
        {loading && records.length === 0 ? <PageLoading label="Loading authorized records…" /> : !loading && records.length === 0 ? (
          <EmptyState title={filterCount ? 'No records match these filters' : 'No active records yet'} description={filterCount ? 'Try a different status, date, currency, creator, or search term.' : canCreate ? 'Create a record to start a traceable administrative history.' : 'No active records are currently available to your account.'} icon={<Archive aria-hidden="true" />} action={filterCount ? <Button variant="secondary" size="small" type="button" onClick={clearFilters}>Clear filters</Button> : canCreate ? <Link className="button button-primary button-sm" to="/app/records/new">Create a record</Link> : undefined} />
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr>
                  <th>Reference</th>
                  <th><SortableHeader label="Amount" field="amount" current={sortBy} direction={sortDirection} onSort={changeSort} /></th>
                  <th><SortableHeader label="Status" field="status" current={sortBy} direction={sortDirection} onSort={changeSort} /></th>
                  <th><SortableHeader label="Issue date" field="issue_date" current={sortBy} direction={sortDirection} onSort={changeSort} /></th>
                  <th><SortableHeader label="Expected" field="expected_processing_date" current={sortBy} direction={sortDirection} onSort={changeSort} /></th>
                  <th><SortableHeader label="Last updated" field="updated_at" current={sortBy} direction={sortDirection} onSort={changeSort} /></th>
                  <th><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td><Link className="table-primary" to={`/app/records/${record.id}`}>{record.tracking_reference}<span className="table-secondary">{record.payee_label}</span></Link></td>
                      <td className="amount-cell">{formatCurrency(record.amount, record.currency)}</td>
                      <td><StatusBadge status={record.status} />{record.archived_at && <span className="table-secondary">Archived {formatDate(record.archived_at)}</span>}</td>
                      <td>{formatDate(record.issue_date)}</td>
                      <td>{formatDate(record.expected_processing_date)}</td>
                      <td>{formatDateTime(record.updated_at)}</td>
                      <td>{profile?.role === 'administrator' && !record.archived_at && <button className="icon-button" type="button" aria-label={`Archive record ${record.tracking_reference}`} onClick={() => setArchiveTarget(record)}><Archive aria-hidden="true" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="table-footer">
              <span>{firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {total.toLocaleString()} records</span>
              <div className="pagination">
                <label><span className="sr-only">Rows per page</span><select className="filter-select" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} aria-label="Rows per page">{pageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}</select></label>
                <Button variant="secondary" size="small" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} aria-label="Previous page">‹</Button>
                <span aria-live="polite">{page} / {pageCount}</span>
                <Button variant="secondary" size="small" type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount || loading} aria-label="Next page">›</Button>
              </div>
            </footer>
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => { if (!open && !archiving) setArchiveTarget(null) }}
        title="Archive this record?"
        description={archiveTarget ? `“${archiveTarget.tracking_reference}” will be removed from the active list. Its history remains preserved, and only an administrator can view archived records.` : ''}
        confirmLabel="Archive record"
        destructive
        loading={archiving}
        onConfirm={() => void confirmArchive()}
      />
    </>
  )
}
