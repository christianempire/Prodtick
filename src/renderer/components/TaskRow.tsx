import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '@shared/types'
import { prodtick } from '../api'
import { sanitizeHtml } from '../lib/format'
import { compactDelta, formatFullDate, fromDatetimeLocal, toDatetimeLocal } from '../lib/time'
import { ArchiveIcon, CheckIcon, CrossIcon, XIcon } from './icons'

type Variant = 'active' | 'done' | 'archive'

interface Props {
  task: Task
  variant: Variant
  sortable?: boolean
  /** Use the compact overlay row markup. */
  overlay?: boolean
}

export default function TaskRow({ task, variant, sortable = false, overlay = false }: Props) {
  const titleRef = useRef<HTMLDivElement | null>(null)
  const [editingDate, setEditingDate] = useState(false)
  const isDone = variant === 'done' || variant === 'archive'

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerHTML !== task.html) el.innerHTML = task.html
  }, [task.html])

  const sortableApi = useSortable({ id: task.id, disabled: !sortable, transition: null })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortableApi

  const style = sortable ? { transform: CSS.Transform.toString(transform), transition } : undefined

  const onBlur = () => {
    const el = titleRef.current
    if (!el) return
    const clean = sanitizeHtml(el.innerHTML).trim()
    if (clean === task.html.trim()) return
    if (!clean) {
      if (variant === 'archive') prodtick.deleteArchived(task.id)
      else prodtick.deleteTask(task.id)
      return
    }
    prodtick.updateTask(task.id, { html: clean })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ;(e.target as HTMLDivElement).blur()
    }
  }

  const onTick = () => {
    if (variant === 'active') prodtick.tickTask(task.id)
    else if (variant === 'done') prodtick.untickTask(task.id)
    else if (variant === 'archive') prodtick.restoreArchived(task.id)
  }

  const onDelete = () => {
    if (variant === 'archive') prodtick.deleteArchived(task.id)
    else prodtick.deleteTask(task.id)
  }

  const rowClass = overlay
    ? `pt-overlay-row${isDragging ? ' dragging' : ''}`
    : `pt-row${isDone ? ' done' : ''}${isDragging ? ' dragging' : ''}`

  return (
    <div ref={setNodeRef} style={style} className={rowClass}>
      <div className="pt-drag" {...attributes} {...listeners} aria-label="Drag handle">
        <span /><span /><span /><span /><span /><span />
      </div>
      <button
        className={`pt-check${isDone ? ' done' : ''}`}
        onClick={onTick}
        aria-label={variant === 'active' ? 'Tick' : variant === 'done' ? 'Untick' : 'Restore'}
        title={
          variant === 'active'
            ? 'Mark as done'
            : variant === 'done'
            ? 'Mark as not done'
            : 'Restore to active'
        }
      />
      <div className="pt-body">
        <div
          ref={titleRef}
          className="pt-title-text"
          contentEditable
          suppressContentEditableWarning
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          dangerouslySetInnerHTML={{ __html: task.html }}
        />
        <div className="pt-meta">
          <span title={`Created ${formatFullDate(task.createdAt)}`}>
            <MetaTime label="created" ts={task.createdAt} />
          </span>
          {isDone && task.completedAt !== null && !editingDate && (
            <button
              type="button"
              className="pt-meta-done"
              title={`Done ${formatFullDate(task.completedAt)} — click to edit`}
              onClick={() => setEditingDate(true)}
            >
              <MetaTime label="done" ts={task.completedAt} numColor="var(--jade)" />
            </button>
          )}
          {isDone && editingDate && (
            <DoneDateEditor
              taskId={task.id}
              initial={task.completedAt ?? Date.now()}
              onClose={() => setEditingDate(false)}
            />
          )}
        </div>
      </div>
      <div className="pt-row-actions">
        {variant === 'done' && (
          <button
            className="pt-row-action"
            onClick={() => prodtick.archiveOne(task.id)}
            title="Archive this task"
            aria-label="Archive"
          >
            <ArchiveIcon />
          </button>
        )}
        <button
          className="pt-row-action danger"
          onClick={onDelete}
          title="Delete"
          aria-label="Delete"
        >
          <XIcon />
        </button>
      </div>
    </div>
  )
}

function MetaTime({ label, ts, numColor }: { label: string; ts: number; numColor?: string }) {
  const d = compactDelta(ts)
  if (d === 'now') return <>{label} just now</>
  return (
    <>
      {label} <span className="pt-meta-num" style={numColor ? { color: numColor } : undefined}>{d}</span> ago
    </>
  )
}

interface EditorProps {
  taskId: string
  initial: number
  onClose: () => void
}

function DoneDateEditor({ taskId, initial, onClose }: EditorProps) {
  const [value, setValue] = useState(toDatetimeLocal(initial))

  const save = () => {
    const ts = fromDatetimeLocal(value)
    if (ts === null) {
      onClose()
      return
    }
    prodtick.setCompletedAt(taskId, ts)
    onClose()
  }

  return (
    <span className="pt-dt" onClick={e => e.stopPropagation()}>
      <input
        type="datetime-local"
        lang="en-GB"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') save()
          else if (e.key === 'Escape') onClose()
        }}
        autoFocus
      />
      <button className="pt-dt-btn ok" onClick={save} title="Save">
        <CheckIcon />
      </button>
      <button className="pt-dt-btn x" onClick={onClose} title="Cancel">
        <CrossIcon />
      </button>
    </span>
  )
}
