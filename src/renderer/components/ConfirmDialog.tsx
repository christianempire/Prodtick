import { ReactNode, useEffect } from 'react'

interface Props {
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return (
    <div className="pt-modal-scrim" onClick={onCancel}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        {title && <div className="pt-modal-head">{title}</div>}
        <div className="pt-modal-body">{message}</div>
        <div className="pt-modal-foot">
          <button className="pt-btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`pt-btn ${destructive ? 'destructive' : 'primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
