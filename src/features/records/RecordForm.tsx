import { useState, type FormEvent } from 'react'
import type { CheckRecord } from '../../lib/types'
import { getUserMessage, logSafeFailure } from '../../lib/errors'
import { recordSchema, type RecordFormValues, type ValidRecordSubmission } from '../../lib/validation'
import { Button } from '../../components/ui/Button'

interface RecordFormProps {
  initial?: CheckRecord
  submitLabel: string
  onSubmit: (values: ValidRecordSubmission) => Promise<void>
  onCancel: () => void
}

type FieldErrors = Partial<Record<keyof RecordFormValues, string>>

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function initialValues(record?: CheckRecord): RecordFormValues {
  const today = todayIso()
  return {
    tracking_reference: record?.tracking_reference ?? '',
    payee_label: record?.payee_label ?? '',
    amount: record ? String(record.amount) : '',
    currency: record?.currency ?? 'USD',
    issue_date: record?.issue_date ?? today,
    expected_processing_date: record?.expected_processing_date ?? today,
    notes: record?.notes ?? '',
  }
}

export default function RecordForm({ initial, submitLabel, onSubmit, onCancel }: RecordFormProps) {
  const [values, setValues] = useState<RecordFormValues>(() => initialValues(initial))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [requestError, setRequestError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField<K extends keyof RecordFormValues>(key: K, value: RecordFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    setRequestError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRequestError('')
    const parsed = recordSchema.safeParse(values)
    if (!parsed.success) {
      const nextErrors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && key in values && !nextErrors[key as keyof RecordFormValues]) {
          nextErrors[key as keyof RecordFormValues] = issue.message
        }
      }
      setFieldErrors(nextErrors)
      return
    }
    setSaving(true)
    try {
      await onSubmit(parsed.data)
    } catch (error) {
      setRequestError(getUserMessage(error))
      logSafeFailure(initial ? 'record update' : 'record creation', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-section">
        <h2>Record information</h2>
        {requestError && <div className="alert alert-error" role="alert" style={{ marginBottom: 17 }}>{requestError}</div>}
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Tracking reference <span aria-hidden="true">*</span></span>
            <input className="field-input" autoComplete="off" maxLength={64} value={values.tracking_reference} onChange={(event) => setField('tracking_reference', event.target.value)} aria-invalid={Boolean(fieldErrors.tracking_reference)} aria-describedby={fieldErrors.tracking_reference ? 'reference-error' : 'reference-hint'} required />
            <span className={fieldErrors.tracking_reference ? 'field-error' : 'field-hint'} id={fieldErrors.tracking_reference ? 'reference-error' : 'reference-hint'}>{fieldErrors.tracking_reference ?? 'Use a non-sensitive internal reference, not an account number.'}</span>
          </label>
          <label className="field">
            <span className="field-label">Payee name or label <span aria-hidden="true">*</span></span>
            <input className="field-input" maxLength={200} value={values.payee_label} onChange={(event) => setField('payee_label', event.target.value)} aria-invalid={Boolean(fieldErrors.payee_label)} aria-describedby={fieldErrors.payee_label ? 'payee-error' : undefined} required />
            {fieldErrors.payee_label && <span className="field-error" id="payee-error">{fieldErrors.payee_label}</span>}
          </label>
          <label className="field">
            <span className="field-label">Amount <span aria-hidden="true">*</span></span>
            <input className="field-input" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={values.amount} onChange={(event) => setField('amount', event.target.value)} aria-invalid={Boolean(fieldErrors.amount)} aria-describedby={fieldErrors.amount ? 'amount-error' : 'amount-hint'} required />
            <span className={fieldErrors.amount ? 'field-error' : 'field-hint'} id={fieldErrors.amount ? 'amount-error' : 'amount-hint'}>{fieldErrors.amount ?? 'Enter a positive amount with up to two decimal places.'}</span>
          </label>
          <label className="field">
            <span className="field-label">Currency <span aria-hidden="true">*</span></span>
            <input className="field-input" type="text" autoComplete="off" maxLength={3} placeholder="USD" value={values.currency} onChange={(event) => setField('currency', event.target.value.toUpperCase())} aria-invalid={Boolean(fieldErrors.currency)} aria-describedby={fieldErrors.currency ? 'currency-error' : 'currency-hint'} required />
            <span className={fieldErrors.currency ? 'field-error' : 'field-hint'} id={fieldErrors.currency ? 'currency-error' : 'currency-hint'}>{fieldErrors.currency ?? 'Three-letter ISO currency code.'}</span>
          </label>
          <label className="field">
            <span className="field-label">Issue date <span aria-hidden="true">*</span></span>
            <input className="field-input" type="date" value={values.issue_date} onChange={(event) => setField('issue_date', event.target.value)} aria-invalid={Boolean(fieldErrors.issue_date)} aria-describedby={fieldErrors.issue_date ? 'issue-date-error' : undefined} required />
            {fieldErrors.issue_date && <span className="field-error" id="issue-date-error">{fieldErrors.issue_date}</span>}
          </label>
          <label className="field">
            <span className="field-label">Expected processing date <span aria-hidden="true">*</span></span>
            <input className="field-input" type="date" value={values.expected_processing_date} onChange={(event) => setField('expected_processing_date', event.target.value)} aria-invalid={Boolean(fieldErrors.expected_processing_date)} aria-describedby={fieldErrors.expected_processing_date ? 'expected-date-error' : undefined} required />
            {fieldErrors.expected_processing_date && <span className="field-error" id="expected-date-error">{fieldErrors.expected_processing_date}</span>}
          </label>
          <label className="field field-full">
            <span className="field-label">Administrative notes</span>
            <textarea className="field-textarea" maxLength={2000} placeholder="Add a brief operational note. Do not enter account numbers, passwords, or security codes." value={values.notes} onChange={(event) => setField('notes', event.target.value)} aria-invalid={Boolean(fieldErrors.notes)} aria-describedby={fieldErrors.notes ? 'notes-error' : 'notes-hint'} />
            <span className={fieldErrors.notes ? 'field-error' : 'field-hint'} id={fieldErrors.notes ? 'notes-error' : 'notes-hint'}>{fieldErrors.notes ?? `${values.notes.length}/2,000 characters`}</span>
          </label>
        </div>
      </div>
      <div className="form-section" style={{ background: '#fbfaf7' }}>
        <div className="alert alert-neutral"><span aria-hidden="true">i</span><span>New records begin in <strong>Draft</strong>. Status changes are recorded separately in an immutable timeline. Status labels do not verify funds.</span></div>
        <div className="form-actions">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : submitLabel}</Button>
        </div>
      </div>
    </form>
  )
}
