import { useCallback, useEffect, useState } from 'react'
import { FileClock, RefreshCw, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../layout/AppShell'
import { useAuth } from '../auth/AuthContext'
import { fetchAuditLogs } from '../../lib/records'
import type { AuditLog } from '../../lib/types'
import { formatDateTime } from '../../lib/format'
import { Button } from '../../components/ui/Button'
import { EmptyState, LoadError, PageLoading } from '../../components/ui/States'
import { logSafeFailure } from '../../lib/errors'

const PAGE_SIZE = 25

export default function AuditPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAuditLogs(page, PAGE_SIZE)
      setRows(result.rows)
      setTotal(result.total)
    } catch (caught) {
      setError(caught)
      logSafeFailure('audit history', caught)
    } finally { setLoading(false) }
  }, [page])
  useEffect(() => { void load() }, [load, refreshKey])

  if (profile?.role !== 'administrator') return <EmptyState title="Administrator access required" description="Audit events contain security-relevant metadata and are restricted to administrators." />
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader eyebrow="Administration" title="Audit history" description="Append-only record of authorized data, status, export, and team-access changes." actions={<Button variant="secondary" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw aria-hidden="true" />Refresh</Button>} />
      <div className="alert alert-neutral" style={{ marginBottom: 14 }}><ShieldCheck aria-hidden="true" /><span>Audit records are not editable through the application. Actor IDs are shortened here; the full user ID remains in the protected record.</span></div>
      {error && <div style={{ marginBottom: 14 }}><LoadError error={error} onRetry={() => setRefreshKey((value) => value + 1)} label="Audit events could not be loaded." /></div>}
      <section className="surface-card table-card" aria-label="Audit events" aria-busy={loading}>
        {loading ? <PageLoading label="Loading audit history…" /> : rows.length === 0 ? <EmptyState title="No audit events yet" description="Record creation, edits, status changes, exports, and team-access changes appear here." icon={<FileClock aria-hidden="true" />} /> : <>
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Minimized metadata</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>
              <td>{formatDateTime(row.created_at)}</td>
              <td><span className="table-primary">{row.actor_user_id?.slice(0, 8) ?? 'System'}</span></td>
              <td><span className="table-primary">{row.action}</span></td>
              <td>{row.resource_type}{row.resource_id ? <span className="table-secondary">{row.resource_id.slice(0, 8)}</span> : null}</td>
              <td style={{ maxWidth: 380, whiteSpace: 'normal', overflowWrap: 'anywhere' }}><code style={{ color: '#6e746f', fontSize: 10 }}>{JSON.stringify(row.minimized_metadata ?? {})}</code></td>
            </tr>)}</tbody>
          </table></div>
          <footer className="table-footer"><span>{total.toLocaleString()} events · page {page} of {pageCount}</span><div className="pagination"><Button variant="secondary" size="small" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading} aria-label="Previous audit page">‹</Button><span>{page} / {pageCount}</span><Button variant="secondary" size="small" type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount || loading} aria-label="Next audit page">›</Button></div></footer>
        </>}
      </section>
    </>
  )
}
