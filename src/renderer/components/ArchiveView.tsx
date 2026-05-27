import { useMemo, useState } from 'react'
import { useTasks } from '../state/tasksStore'
import { prodtick } from '../api'
import TaskRow from './TaskRow'
import ConfirmDialog from './ConfirmDialog'
import { dayKey } from '../lib/time'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function dayHeader(key: string): { month: string; day: string } {
  if (key === 'unknown') return { month: 'UNKNOWN', day: '·' }
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const month = dt
    .toLocaleDateString(undefined, { month: 'short' })
    .toUpperCase()
  return { month, day: String(d) }
}

export default function ArchiveView() {
  const archive = useTasks(s => s.data?.archive ?? [])
  const [confirming, setConfirming] = useState(false)

  const groups = useMemo(() => {
    const map = new Map<string, typeof archive>()
    for (const t of archive) {
      const k = t.completedAt !== null ? dayKey(t.completedAt) : 'unknown'
      const arr = map.get(k) ?? []
      arr.push(t)
      map.set(k, arr)
    }
    const keys = [...map.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    return keys.map(k => ({ key: k, items: map.get(k)! }))
  }, [archive])

  const onClearConfirmed = () => {
    prodtick.clearArchive()
    setConfirming(false)
  }

  return (
    <>
      <div className="pt-scroll">
        <div className="pt-section">
          <div className="pt-section-label">Archive</div>
          <div className="pt-section-rule" />
          <div className="pt-section-count">{pad2(archive.length)}</div>
          <button
            className="pt-section-action"
            onClick={() => setConfirming(true)}
            disabled={archive.length === 0}
          >
            Clear archive
          </button>
        </div>

        {archive.length === 0 && (
          <div className="pt-empty-soft">Nothing in the archive yet.</div>
        )}

        {groups.map(g => {
          const h = dayHeader(g.key)
          return (
            <div key={g.key}>
              <div className="pt-day">
                <div className="pt-day-num">{h.day}</div>
                <div className="pt-day-label">{h.month}</div>
                <div className="pt-day-rule" />
                <div className="pt-day-label">{pad2(g.items.length)}</div>
              </div>
              <div className="pt-list">
                {g.items.map(t => (
                  <TaskRow key={t.id} task={t} variant="archive" sortable={false} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {confirming && (
        <ConfirmDialog
          title="Clear the archive?"
          message={
            <>
              This permanently deletes all <em>{archive.length}</em> archived task
              {archive.length === 1 ? '' : 's'}. There is no undo — they will not be in the
              bin, the trash, or anywhere else.
            </>
          }
          confirmLabel="Delete forever"
          destructive
          onConfirm={onClearConfirmed}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
