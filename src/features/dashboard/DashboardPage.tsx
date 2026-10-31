import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Activity, ArrowRight, Clock3, FileCheck2, FilePlus2, RotateCcw, Search, ShieldAlert, Timer, WalletCards } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '../layout/AppShell'
import { useAuth } from '../auth/AuthContext'
import { fetchDashboardSummary } from '../../lib/records'
import type { DashboardSummary } from '../../lib/types'
import { formatCurrency, formatDate, formatDateTime, statusLabels } from '../../lib/format'
import StatusBadge from '../../components/ui/StatusBadge'
import { EmptyState, LoadError, PageLoading } from '../../components/ui/States'
import { Button } from '../../components/ui/Button'
import { logSafeFailure } from '../../lib/errors'
import { checkStatuses } from '../../lib/validation'
import type { CheckStatus } from '../../lib/types'

function StatCard({ label, value, note, icon: Icon }: { label: string; value: number | null; note: string; icon: typeof Activity }) {
  return (
    <article className="stat-card" aria-label={`${label}: ${value === null ? 'loading' : value}`}>
      <div className="stat-topline"><span className="stat-label">{label}</span><span className="stat-icon"><Icon aria-hidden="true" /></span></div>
      {value === null ? <div className="skeleton" style={{ width: 76, height: 26, marginTop: 13 }} aria-hidden="true" /> : <p className="stat-value">{value.toLocaleString()}</p>}
      <div className="stat-footnote">{note}</div>
    </article>
  )
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [quickSearch, setQuickSearch] = useState('')
  const [quickStatus, setQuickStatus] = useState<CheckStatus | 'all'>('all')
  const [quickFromDate, setQuickFromDate] = useState('')
  const [quickToDate, setQuickToDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSummary(await fetchDashboardSummary())
    } catch (caught) {
      logSafeFailure('dashboard totals', caught)
      setError(caught)
      toast.error('Dashboard totals could not be refreshed.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load, refreshKey])

  function findRecords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (quickSearch.trim()) params.set('search', quickSearch.trim())
    if (quickStatus !== 'all') params.set('status', quickStatus)
    if (quickFromDate) params.set('fromDate', quickFromDate)
    if (quickToDate) params.set('toDate', quickToDate)
    navigate(`/app/records${params.size ? `?${params.toString()}` : ''}`)
  }

  const canWrite = profile?.role === 'administrator' || profile?.role === 'staff'
  const stats = [
    { label: 'Total active records', value: summary?.total ?? null, note: 'Current database total', icon: WalletCards },
    { label: 'Pending', value: summary?.pending ?? null, note: 'Awaiting next step', icon: Timer },
    { label: 'Processing', value: summary?.processing ?? null, note: 'In the workflow', icon: Activity },
    { label: 'Cleared', value: summary?.cleared ?? null, note: 'Recorded status only', icon: FileCheck2 },
    { label: 'Returned', value: summary?.returned ?? null, note: 'Requires administrative review', icon: RotateCcw },
    { label: 'On hold', value: summary?.on_hold ?? null, note: 'Temporarily paused', icon: ShieldAlert },
    { label: 'Recently updated', value: summary?.updatedThisWeek ?? null, note: 'Updated in the last 7 days', icon: Clock3 },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="A current view of your authorized check records and their recorded workflow status."
        actions={<>
          <Button variant="secondary" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RotateCcw aria-hidden="true" />Refresh</Button>
          {canWrite && <Link className="button button-primary" to="/app/records/new"><FilePlus2 aria-hidden="true" />Create record</Link>}
        </>}
      />

      {error && <div style={{ marginBottom: 16 }}><LoadError error={error} onRetry={() => setRefreshKey((value) => value + 1)} label="Live database totals are temporarily unavailable." /></div>}

      <section className="stats-grid" aria-label="Record totals" aria-busy={loading}>
        {stats.map((item) => <StatCard key={item.label} {...item} />)}
      </section>

      <form className="dashboard-quickbar surface-card" onSubmit={findRecords} aria-label="Quick find records">
        <label className="field dashboard-quick-search">
          <span className="field-label">Reference or internal ID</span>
          <span className="search-box"><Search aria-hidden="true" /><input aria-label="Search tracking reference or internal ID" value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} placeholder="Search records…" /></span>
        </label>
        <label className="field"><span className="field-label">Status</span><select className="filter-select" value={quickStatus} onChange={(event) => setQuickStatus(event.target.value as CheckStatus | 'all')}><option value="all">All statuses</option>{checkStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
        <label className="field"><span className="field-label">Issue date from</span><input className="filter-select" type="date" aria-label="Issue date from" value={quickFromDate} onChange={(event) => setQuickFromDate(event.target.value)} /></label>
        <label className="field"><span className="field-label">Issue date to</span><input className="filter-select" type="date" aria-label="Issue date to" value={quickToDate} onChange={(event) => setQuickToDate(event.target.value)} /></label>
        <Button type="submit"><Search aria-hidden="true" />Find records</Button>
      </form>

      <div className="dashboard-grid">
        <section className="surface-card table-card" aria-labelledby="recent-records-heading">
          <div className="card-heading">
            <div><h2 id="recent-records-heading">Recently updated records</h2><p>{summary ? `${summary.updatedThisWeek.toLocaleString()} updated in the last 7 days` : 'Live record activity'}</p></div>
            <Link className="button button-quiet button-sm" to="/app/records">All records <ArrowRight aria-hidden="true" /></Link>
          </div>
          {loading && !summary ? <PageLoading label="Loading database records…" /> : !summary?.recentRecords.length ? (
            <EmptyState title="No active records yet" description={canWrite ? 'Create the first record to begin a traceable administrative history.' : 'No active records are currently available to your account.'} icon={<FilePlus2 aria-hidden="true" />} action={canWrite ? <Link className="button button-primary button-sm" to="/app/records/new">Create a record</Link> : undefined} />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Reference</th><th>Amount</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {summary.recentRecords.map((record) => (
                    <tr key={record.id}>
                      <td><Link className="table-primary" to={`/app/records/${record.id}`}>{record.tracking_reference}<span className="table-secondary">Issued {formatDate(record.issue_date)}</span></Link></td>
                      <td className="amount-cell">{formatCurrency(record.amount, record.currency)}</td>
                      <td><StatusBadge status={record.status} /></td>
                      <td>{formatDateTime(record.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="surface-card" aria-labelledby="activity-heading">
          <div className="card-heading"><div><h2 id="activity-heading">Status history</h2><p>Recent changes recorded in the database</p></div><span className="stat-icon"><Clock3 aria-hidden="true" /></span></div>
          <div className="card-body">
            {loading && !summary ? <div className="loading-state" style={{ minHeight: 150 }}><span className="loading-mark"><span className="spinner" />Loading history…</span></div> : !summary?.recentHistory.length ? (
              <EmptyState title="No status changes yet" description="Status changes will appear here with their recorded actor and time." icon={<Activity aria-hidden="true" />} />
            ) : (
              <div className="timeline">
                {summary.recentHistory.map((event) => {
                  const relation = event.check_records
                  const ref = Array.isArray(relation) ? relation[0]?.tracking_reference : relation?.tracking_reference
                  return (
                    <div className="timeline-item" key={event.id}>
                      <span className="timeline-dot" aria-hidden="true"><span /> </span>
                      <div className="timeline-content">
                        <div className="timeline-title">
                          {ref ? <Link to={`/app/records/${event.check_record_id}`}>{ref}</Link> : `Record ${event.check_record_id.slice(0, 8)}`}
                          {event.new_status && <span> · {statusLabels[event.new_status]}</span>}
                        </div>
                        <div className="timeline-meta">{formatDateTime(event.created_at)} · actor {event.actor_user_id?.slice(0, 8) ?? 'unavailable'}</div>
                        {event.reason && <div className="timeline-reason">{event.reason}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
      <p className="field-hint" style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 6 }}><Search aria-hidden="true" size={13} />Totals are live database counts. A recorded status is not independent verification of funds.</p>
    </>
  )
}
