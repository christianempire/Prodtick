import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTasks } from '../state/tasksStore'
import { prodtick } from '../api'
import TaskRow from './TaskRow'
import AddTask from './AddTask'
import FormatToolbar from './FormatToolbar'
import SortableList from './SortableList'
import { ExpandIcon, XIcon } from './icons'

export default function OverlayView() {
  const active = useTasks(s => s.data?.active ?? [])
  const done = useTasks(s => s.data?.done ?? [])
  const [showDone, setShowDone] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') prodtick.overlayHide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Measure the overlay's natural content height and ask main to resize the
  // BrowserWindow so the overlay never needs to scroll.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    let raf = 0
    const report = () => {
      raf = 0
      prodtick.overlayResize(el.offsetHeight)
    }
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(report)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="pt-overlay" ref={rootRef}>
      <div className="pt-overlay-head">
        <div className="pt-overlay-name">PRODTICK</div>
        <div className="pt-overlay-actions">
          <button
            className="pt-title-btn"
            title="Open main window"
            onClick={() => prodtick.showMainWindow()}
          >
            <ExpandIcon />
          </button>
          <button
            className="pt-title-btn danger"
            title="Hide overlay"
            onClick={() => prodtick.overlayHide()}
          >
            <XIcon />
          </button>
        </div>
      </div>

      <AddTask placeholder="Quick add…" overlay />

      <div className="pt-overlay-list">
        {active.length === 0 ? (
          <div className="pt-overlay-empty">No active tasks.</div>
        ) : (
          <SortableList items={active}>
            {active.map(t => (
              <TaskRow key={t.id} task={t} variant="active" sortable overlay />
            ))}
          </SortableList>
        )}

        <button
          className={`pt-overlay-divider${showDone ? ' open' : ''}`}
          onClick={() => setShowDone(v => !v)}
          aria-expanded={showDone}
        >
          <span className="caret" />
          <span>DONE</span>
          <div className="pt-overlay-divider-rule" />
          <span className="pt-overlay-divider-count">{done.length}</span>
        </button>

        {showDone &&
          (done.length === 0 ? (
            <div className="pt-overlay-empty">Nothing ticked yet.</div>
          ) : (
            done.map(t => (
              <TaskRow key={t.id} task={t} variant="done" sortable={false} overlay />
            ))
          ))}
      </div>

      <FormatToolbar />
    </div>
  )
}
