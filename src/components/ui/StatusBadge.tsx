import type { CheckStatus } from '../../lib/types'
import { statusLabels } from '../../lib/format'

export default function StatusBadge({ status }: { status: CheckStatus }) {
  return <span className="status-badge" data-status={status}>{statusLabels[status]}</span>
}
