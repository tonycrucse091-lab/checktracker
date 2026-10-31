import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '../layout/AppShell'
import { useAuth } from '../auth/AuthContext'
import RecordForm from './RecordForm'
import { createCheckRecord, fetchCheckRecord, updateCheckRecord } from '../../lib/records'
import type { CheckRecord } from '../../lib/types'
import type { ValidRecordSubmission } from '../../lib/validation'
import { EmptyState, LoadError, PageLoading } from '../../components/ui/States'
import { logSafeFailure } from '../../lib/errors'

function canManage(role: string | undefined): boolean { return role === 'administrator' || role === 'staff' }

export function CreateRecordPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  if (!canManage(profile?.role)) return <div className="alert alert-error" role="alert">Your role does not allow record creation.</div>

  async function create(values: ValidRecordSubmission) {
    const record = await createCheckRecord(values)
    toast.success('Draft record created with an audit entry.')
    navigate(`/app/records/${record.id}`, { replace: true })
  }

  return (
    <>
      <PageHeader eyebrow="New record" title="Create a record" description="Record the minimum administrative details needed for traceable tracking. New records begin as Draft." actions={<Link className="button button-secondary" to="/app/records"><ArrowLeft aria-hidden="true" />Back to records</Link>} />
      <section className="surface-card" style={{ maxWidth: 900 }}><RecordForm submitLabel="Create Draft record" onSubmit={create} onCancel={() => navigate('/app/records')} /></section>
    </>
  )
}

export function EditRecordPage() {
  const { recordId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [record, setRecord] = useState<CheckRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    if (!recordId) {
      setError(new Error('Record ID is missing.'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setRecord(await fetchCheckRecord(recordId))
    } catch (caught) {
      setError(caught)
      logSafeFailure('record edit load', caught)
    } finally {
      setLoading(false)
    }
  }, [recordId])

  useEffect(() => { void load() }, [load])

  if (!canManage(profile?.role)) return <EmptyState title="Edit access is restricted" description="Your account does not have permission to edit records." action={<Link className="button button-secondary" to="/app/records">Back to records</Link>} />
  if (loading) return <PageLoading label="Loading record for editing…" />
  if (error || !record) return <><PageHeader eyebrow="Edit record" title="Record unavailable" /><LoadError error={error ?? new Error('Record not found.')} onRetry={() => void load()} /></>
  const currentRecord = record
  if (currentRecord.archived_at) return <><PageHeader eyebrow="Archived record" title={currentRecord.tracking_reference} /><EmptyState title="Archived records cannot be edited" description="The record is preserved for history and is no longer active." action={<Link className="button button-secondary" to={`/app/records/${currentRecord.id}`}>View record</Link>} /></>

  async function save(values: ValidRecordSubmission) {
    await updateCheckRecord(currentRecord.id, values)
    toast.success('Record details updated and audit logged.')
    navigate(`/app/records/${currentRecord.id}`, { replace: true })
  }

  return (
    <>
      <PageHeader eyebrow="Edit record" title={`Edit ${record.tracking_reference}`} description="Only business fields are editable here. Status, actor, verification, and audit fields are controlled by trusted database functions." actions={<Link className="button button-secondary" to={`/app/records/${currentRecord.id}`}><ArrowLeft aria-hidden="true" />Cancel</Link>} />
      <section className="surface-card" style={{ maxWidth: 900 }}><RecordForm initial={currentRecord} submitLabel="Save changes" onSubmit={save} onCancel={() => navigate(`/app/records/${currentRecord.id}`)} /></section>
    </>
  )
}
