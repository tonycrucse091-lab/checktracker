import type { CheckStatus, UserRole } from './types'

export const statusLabels: Record<CheckStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  pending: 'Pending',
  processing: 'Processing',
  on_hold: 'On hold',
  cleared: 'Cleared',
  returned: 'Returned',
  cancelled: 'Cancelled',
}

export const roleLabels: Record<UserRole, string> = {
  administrator: 'Administrator',
  staff: 'Staff',
  read_only: 'Read-only',
}

export function formatCurrency(amount: number | string, currency: string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(value)) return '—'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function getInitials(nameOrEmail: string): string {
  const source = nameOrEmail.trim()
  if (!source) return 'CT'
  const pieces = source.includes('@') ? [source.split('@')[0] ?? ''] : source.split(/\s+/)
  return pieces.slice(0, 2).map((piece) => piece[0]?.toUpperCase() ?? '').join('') || 'CT'
}
