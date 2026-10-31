import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

export default function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive = false, loading = false, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <span className="empty-icon" style={{ width: 38, height: 38, flex: '0 0 auto', color: destructive ? '#9a5049' : '#8b7140', background: destructive ? '#fbefed' : '#f7f3e9', borderColor: destructive ? '#edd5d1' : '#e7dfce' }}><AlertTriangle aria-hidden="true" style={{ width: 18, height: 18 }} /></span>
              <div>
                <Dialog.Title className="dialog-title">{title}</Dialog.Title>
                <Dialog.Description className="dialog-description">{description}</Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild><button className="icon-button" aria-label="Close dialog" disabled={loading}><X aria-hidden="true" /></button></Dialog.Close>
          </div>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
            <Button variant={destructive ? 'danger' : 'primary'} type="button" onClick={() => void onConfirm()} disabled={loading}>
              {loading ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
