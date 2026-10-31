import { useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { CheckRecord, CheckStatus } from '../../lib/types'
import { allowedStatusTransitions, statusChangeSchema } from '../../lib/validation'
import { statusLabels } from '../../lib/format'
import { getUserMessage, logSafeFailure } from '../../lib/errors'
import { Button } from '../../components/ui/Button'

interface StatusChangeDialogProps {
  record: CheckRecord
  open: boolean
  loading?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (status: CheckStatus, reason: string | null) => Promise<void>
}

export default function StatusChangeDialog({ record, open, loading = false, onOpenChange, onSubmit }: StatusChangeDialogProps) {
  const options = allowedStatusTransitions[record.status]
  const [status, setStatus] = useState<CheckStatus>(options[0] ?? record.status)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setError('')
      setReason('')
      setStatus(options[0] ?? record.status)
    }
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsed = statusChangeSchema.safeParse({ status, reason })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the status update details.')
      return
    }
    if (!options.includes(parsed.data.status)) {
      setError('That transition is not allowed from the current status.')
      return
    }
    try {
      await onSubmit(parsed.data.status, parsed.data.reason)
      handleOpenChange(false)
    } catch (caught) {
      setError(getUserMessage(caught))
      logSafeFailure('status change dialog', caught)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby="status-dialog-description">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Dialog.Title className="dialog-title">Update recorded status</Dialog.Title>
              <Dialog.Description id="status-dialog-description" className="dialog-description">Record {record.tracking_reference}: {statusLabels[record.status]} → choose an allowed next status.</Dialog.Description>
            </div>
            <Dialog.Close asChild><button className="icon-button" type="button" aria-label="Close status dialog" disabled={loading}><X aria-hidden="true" /></button></Dialog.Close>
          </div>
          {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
          {options.length === 0 ? (
            <div className="alert alert-neutral" role="status">{statusLabels[record.status]} is terminal. No further status change is available.</div>
          ) : (
            <form onSubmit={(event) => void handleSubmit(event)} noValidate>
              <div className="field-grid">
                <label className="field field-full">
                  <span className="field-label">New status</span>
                  <select className="field-select" value={status} onChange={(event) => setStatus(event.target.value as CheckStatus)} disabled={loading}>
                    {options.map((option) => <option key={option} value={option}>{statusLabels[option]}</option>)}
                  </select>
                </label>
                <label className="field field-full">
                  <span className="field-label">Reason <span className="field-hint">(optional)</span></span>
                  <textarea className="field-textarea" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Briefly note the operational reason for this change." disabled={loading} />
                </label>
              </div>
              {(status === 'cleared' || status === 'returned') && <div className="alert" style={{ marginTop: 14 }} role="note">This is a manually recorded status. It does not confirm payment or settlement without a trusted verification source.</div>}
              <div className="dialog-actions">
                <Button variant="secondary" type="button" onClick={() => handleOpenChange(false)} disabled={loading}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Record status change'}</Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
