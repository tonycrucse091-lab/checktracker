import type { ReactNode } from 'react'
import { AlertCircle, FileSearch } from 'lucide-react'
import { getUserMessage, logSafeFailure } from '../../lib/errors'

export function PageLoading({ label = 'Loading CheckTrack data…' }: { label?: string }) {
  return <div className="loading-state" role="status" aria-live="polite"><span className="loading-mark"><span className="spinner" aria-hidden="true" />{label}</span></div>
}

export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon ?? <FileSearch />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div style={{ marginTop: 15 }}>{action}</div>}
    </div>
  )
}

export function LoadError({ error, onRetry, label = 'We could not load this information.' }: { error: unknown; onRetry?: () => void; label?: string }) {
  logSafeFailure('page data load', error)
  return (
    <div className="alert alert-error" role="alert" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><AlertCircle aria-hidden="true" />{label} {getUserMessage(error)}</span>
      {onRetry && <button className="button button-secondary button-sm" type="button" onClick={onRetry}>Try again</button>}
    </div>
  )
}
