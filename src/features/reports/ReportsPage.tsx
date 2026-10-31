import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, FileSpreadsheet, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../layout/AppShell'
import { useAuth } from '../auth/AuthContext'
import type { RecordFilters } from '../../lib/types'
import { fetchRecords } from '../../lib/records'
import { checkStatuses } from '../../lib/validation'
import { statusLabels } from '../../lib/format'
import { downloadBlob, requestRecordExport } from '../../lib/exports'
import { Button } from '../../components/ui/Button'
import { EmptyState, LoadError, PageLoading } from '../../components/ui/States'
import { logSafeFailure } from '../../lib/errors'

export default function ReportsPage() {
  const { profile } = useAuth()
  const canExport = profile?.role === 'administrator' || profile?.can_export_records === true
  const [status, setStatus] = useState('all')
  const [currency, setCurrency] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const filters = useMemo<RecordFilters>(() => ({
    status: status === 'all' ? 'all' : status as RecordFilters['status'],
    currency: currency ? currency.toUpperCase() : 'all',
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    includeArchived: profile?.role === 'administrator' && includeArchived,
    page: 1,
    pageSize: 1,
    sortBy: 'updated_at',
    sortDirection: 'desc',
  }), [status, currency, fromDate, toDate, profile?.role, includeArchived])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRecords(filters)
      setMatchCount(result.total)
    } catch (caught) {
      setError(caught)
      logSafeFailure('report record count', caught)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [load, refreshKey])

  async function exportFilteredReport() {
    if (!canExport) {
      toast.error('Your account does not have permission to export records.')
      return
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast.error('The start date must be on or before the end date.')
      return
    }
    setExporting(true)
    try {
      const blob = await requestRecordExport(filters)
      downloadBlob(blob, `checktrack-report-${new Date().toISOString().slice(0, 10)}.csv`)
      toast.success('Authorized report downloaded.')
    } catch (caught) {
      logSafeFailure('report export', caught)
      toast.error(caught instanceof Error ? caught.message : 'The report could not be exported.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader eyebrow="Reporting" title="Reports & exports" description="Build a filtered view and export only records your authenticated role is permitted to access." />
      {error && <div style={{ marginBottom: 15 }}><LoadError error={error} onRetry={() => setRefreshKey((value) => value + 1)} label="The report count could not be loaded." /></div>}
      <div className="detail-grid">
        <section className="surface-card">
          <div className="card-heading"><div><h2>Report filters</h2><p>Filters apply to the live count and the CSV export.</p></div><span className="stat-icon"><FileSpreadsheet aria-hidden="true" /></span></div>
          <div className="form-section" style={{ paddingTop: 5 }}>
            <div className="field-grid">
              <label className="field"><span className="field-label">Status</span><select className="field-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All active statuses</option>{checkStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
              <label className="field"><span className="field-label">Currency</span><input className="field-input" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} placeholder="All currencies" maxLength={3} /></label>
              <label className="field"><span className="field-label">Issue date from</span><input className="field-input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
              <label className="field"><span className="field-label">Issue date to</span><input className="field-input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
              {profile?.role === 'administrator' && <label className="field field-full" style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /><span className="field-label">Include archived records</span></label>}
            </div>
            <div className="form-actions"><Button variant="secondary" type="button" onClick={() => { setStatus('all'); setCurrency(''); setFromDate(''); setToDate(''); setIncludeArchived(false) }}>Reset filters</Button><Button type="button" onClick={() => void exportFilteredReport()} disabled={!canExport || exporting || loading || (Boolean(fromDate && toDate) && fromDate > toDate)}><ArrowDownToLine aria-hidden="true" />{exporting ? 'Preparing CSV…' : 'Export filtered CSV'}</Button></div>
          </div>
        </section>
        <aside style={{ display: 'grid', gap: 15 }}>
          <section className="stat-card" style={{ minHeight: 150 }}><div className="stat-topline"><span className="stat-label">Matching records</span><span className="stat-icon"><FileSpreadsheet aria-hidden="true" /></span></div>{loading ? <PageLoading label="Counting filtered records…" /> : <p className="stat-value">{matchCount.toLocaleString()}</p>}<div className="stat-footnote">Live count from the database under your access policy</div></section>
          {canExport ? <div className="alert"><ShieldCheck aria-hidden="true" /><span>Your role is authorized to export. Every export is recorded in the audit log. CSV text is protected against spreadsheet formula injection.</span></div> : <div className="alert alert-neutral"><ShieldCheck aria-hidden="true" /><span>Read-only accounts and staff without explicit export permission cannot download records.</span></div>}
          <EmptyState title="No hidden access path" description="The export function checks the signed-in user’s role and asks PostgreSQL under that user’s access policies before preparing a file." icon={<ShieldCheck aria-hidden="true" />} />
        </aside>
      </div>
    </>
  )
}
