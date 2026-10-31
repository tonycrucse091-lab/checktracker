import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Archive, CalendarDays, Clock3, Edit3, FileClock, ShieldCheck } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '../layout/AppShell'
import { useAuth } from '../auth/AuthContext'
import { archiveCheckRecord, fetchCheckRecord, fetchRecordHistory, updateCheckStatus } from '../../lib/records'
import type { CheckRecord, CheckStatus, CheckStatusHistory } from '../../lib/types'
import { formatCurrency, formatDate, formatDateTime, statusLabels } from '../../lib/format'
import StatusBadge from '../../components/ui/StatusBadge'
import { Button } from '../../components/ui/Button'
import { EmptyState, LoadError, PageLoading } from '../../components/ui/States'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import StatusChangeDialog from './StatusChangeDialog'
import { logSafeFailure } from '../../lib/errors'

export default function RecordDetailsPage() {
  const { recordId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [record, setRecord] = useState<CheckRecord | null>(null)
  const [history, setHistory] = useState<CheckStatusHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [statusDialog, setStatusDialog] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [archiveDialog, setArchiveDialog] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    if (!recordId) {
      setError(new Error('Record ID is missing.'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [nextRecord, nextHistory] = await Promise.all([fetchCheckRecord(recordId), fetchRecordHistory(recordId)])
      setRecord(nextRecord)
      setHistory(nextHistory)
    } catch (caught) {
      logSafeFailure('record detail', caught)
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [recordId])

  useEffect(() => { void load() }, [load])

  async function changeStatus(status: CheckStatus, reason: string | null) {
    if (!record) return
    setStatusSaving(true)
    try {
      await updateCheckStatus(record.id, status, reason)
      toast.success(`Status recorded as ${statusLabels[status]}.`)
      setStatusDialog(false)
      await load()
    } catch (caught) {
      logSafeFailure('status change', caught)
      throw caught
    } finally {
      setStatusSaving(false)
    }
  }

  async function archiveRecord() {
    if (!record) return
    setArchiving(true)
    try {
      await archiveCheckRecord(record.id)
      toast.success('Record archived. Its timeline remains preserved.')
      navigate('/app/records', { replace: true })
    } catch (caught) {
      logSafeFailure('archive record', caught)
      toast.error(caught instanceof Error ? caught.message : 'This record could not be archived.')
    } finally {
      setArchiving(false)
    }
  }

  if (loading) return <PageLoading label="Loading record and history…" />
  if (error || !record) return <><PageHeader eyebrow="Record" title="Record unavailable" description="The record may not exist or your account may not have access." actions={<Link className="button button-secondary" to="/app/records"><ArrowLeft aria-hidden="true" />Back to records</Link>} /><LoadError error={error ?? new Error('Record not found.')} onRetry={() => void load()} label="Record details could not be loaded." /></>

  const canWrite = profile?.role === 'administrator' || profile?.role === 'staff'
  const canArchive = profile?.role === 'administrator' && !record.archived_at
  const timeline = [...history].reverse()

  return (
    <>
      <PageHeader eyebrow="Record detail" title={record.tracking_reference} description={`Created ${formatDateTime(record.created_at)} · Record ID ${record.id}`} actions={<>
        <Link className="button button-secondary" to="/app/records"><ArrowLeft aria-hidden="true" />All records</Link>
        {canWrite && !record.archived_at && <Link className="button button-secondary" to={`/app/records/${record.id}/edit`}><Edit3 aria-hidden="true" />Edit</Link>}
        {canWrite && !record.archived_at && <Button type="button" onClick={() => setStatusDialog(true)} disabled={!Object.keys(record).length}><FileClock aria-hidden="true" />Update status</Button>}
        {canArchive && <Button variant="danger" type="button" onClick={() => setArchiveDialog(true)}><Archive aria-hidden="true" />Archive</Button>}
      </>} />

      <div className="detail-grid">
        <div style={{ display: 'grid', gap: 15 }}>
          <section className="surface-card">
            <div className="card-heading"><div><h2>Record overview</h2><p>Administrative tracking information only</p></div><StatusBadge status={record.status} /></div>
            <div className="card-body">
              <div className="detail-list">
                <div className="detail-item"><div className="detail-label">Amount</div><div className="detail-value" style={{ fontSize: 18 }}>{formatCurrency(record.amount, record.currency)}</div></div>
                <div className="detail-item"><div className="detail-label">Payee label</div><div className="detail-value">{record.payee_label}</div></div>
                <div className="detail-item"><div className="detail-label">Issue date</div><div className="detail-value">{formatDate(record.issue_date)}</div></div>
                <div className="detail-item"><div className="detail-label">Expected processing date</div><div className="detail-value">{formatDate(record.expected_processing_date)}</div></div>
                <div className="detail-item"><div className="detail-label">Created by</div><div className="detail-value">{record.created_by.slice(0, 8)}</div></div>
                <div className="detail-item"><div className="detail-label">Last updated</div><div className="detail-value">{formatDateTime(record.updated_at)}{record.updated_by && <span className="table-secondary">Actor {record.updated_by.slice(0, 8)}</span>}</div></div>
              </div>
              {record.notes && <div style={{ borderTop: '1px solid #eee9df', marginTop: 19, paddingTop: 16 }}><div className="detail-label">Administrative notes</div><p style={{ margin: 0, color: '#48514e', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{record.notes}</p></div>}
              {record.archived_at && <div className="alert alert-neutral" role="status" style={{ marginTop: 18 }}><Archive aria-hidden="true" /><span>Archived on {formatDateTime(record.archived_at)}. Changes are no longer available.</span></div>}
            </div>
          </section>

          <section className="surface-card">
            <div className="card-heading"><div><h2>Status history</h2><p>Append-only timeline · newest status changes follow the creation event</p></div><span className="stat-icon"><Clock3 aria-hidden="true" /></span></div>
            <div className="card-body">
              {timeline.length === 0 ? <EmptyState title="No status transitions yet" description="The initial Draft status was recorded when this record was created. Later changes will appear here with actor and timestamp." icon={<FileClock aria-hidden="true" />} /> : (
                <div className="timeline">
                  {timeline.map((event) => (
                    <div className="timeline-item" key={event.id}>
                      <span className="timeline-dot" aria-hidden="true"><span /></span>
                      <div className="timeline-content">
                        <div className="timeline-title">{event.previous_status ? statusLabels[event.previous_status] : 'Created'} → {statusLabels[event.new_status]}</div>
                        <div className="timeline-meta">{formatDateTime(event.created_at)} · actor {event.actor_user_id?.slice(0, 8) ?? 'unavailable'}</div>
                        {event.reason && <div className="timeline-reason">{event.reason}</div>}
                        {event.verification_source ? <div className="timeline-meta" style={{ color: '#49735a' }}><ShieldCheck aria-hidden="true" size={12} /> Source: {event.verification_source}{event.verification_timestamp ? ` · ${formatDateTime(event.verification_timestamp)}` : ''}</div> : <div className="timeline-meta">Manual status; no external verification source attached.</div>}
                      </div>
                    </div>
                  ))}
                  <div className="timeline-item">
                    <span className="timeline-dot" aria-hidden="true"><span /></span>
                    <div className="timeline-content"><div className="timeline-title">Record created · Draft</div><div className="timeline-meta">{formatDateTime(record.created_at)} · actor {record.created_by.slice(0, 8)}</div></div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside style={{ display: 'grid', gap: 15 }}>
          <section className="surface-card">
            <div className="card-heading"><div><h2>Verification status</h2><p>Source attribution</p></div><span className="stat-icon"><ShieldCheck aria-hidden="true" /></span></div>
            <div className="card-body">
              {record.verification_source && record.verification_timestamp ? (
                <div className="alert" role="status"><ShieldCheck aria-hidden="true" /><span>Recorded as verified by <strong>{record.verification_source}</strong> on {formatDateTime(record.verification_timestamp)}.</span></div>
              ) : (
                <div className="alert alert-neutral" role="note"><CalendarDays aria-hidden="true" /><span><strong>{statusLabels[record.status]}</strong> is a manually recorded administrative status. This application has no authorized external verification source attached to this record.</span></div>
              )}
            </div>
          </section>
          <section className="surface-card">
            <div className="card-heading"><div><h2>Record identifiers</h2><p>Use the reference for internal tracking</p></div></div>
            <div className="card-body"><div className="detail-item"><div className="detail-label">Opaque internal ID</div><div className="detail-value" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10 }}>{record.id}</div></div></div>
          </section>
        </aside>
      </div>

      <StatusChangeDialog record={record} open={statusDialog} loading={statusSaving} onOpenChange={setStatusDialog} onSubmit={changeStatus} />
      <ConfirmDialog open={archiveDialog} onOpenChange={(open) => { if (!archiving) setArchiveDialog(open) }} title="Archive this record?" description={`“${record.tracking_reference}” will be removed from the active list. Its history remains preserved; only administrators can access archived records.`} confirmLabel="Archive record" destructive loading={archiving} onConfirm={() => void archiveRecord()} />
    </>
  )
}
