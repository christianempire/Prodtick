import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { applyColor, ColorName, exec } from '../lib/format'

const SWATCHES: { name: ColorName | null; varName?: string; aria: string }[] = [
  { name: null, aria: 'Clear color' },
  { name: 'red', varName: 'var(--hl-red)', aria: 'Red' },
  { name: 'orange', varName: 'var(--hl-orange)', aria: 'Orange' },
  { name: 'yellow', varName: 'var(--hl-yellow)', aria: 'Yellow' },
  { name: 'jade', varName: 'var(--hl-jade)', aria: 'Jade' },
  { name: 'blue', varName: 'var(--hl-blue)', aria: 'Blue' },
  { name: 'violet', varName: 'var(--hl-violet)', aria: 'Violet' }
]

const MARGIN = 6
const TOOLBAR_HEIGHT = 38

interface Anchor {
  centerX: number
  top: number
}

export default function FormatToolbar() {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function updateFromSelection() {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setAnchor(null)
        return
      }
      const anchorNode = sel.anchorNode
      if (!anchorNode) {
        setAnchor(null)
        return
      }
      const el = (anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement) as HTMLElement | null
      if (!el || !el.closest('.pt-title-text')) {
        setAnchor(null)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        setAnchor(null)
        return
      }
      setAnchor({ centerX: rect.left + rect.width / 2, top: rect.top })
    }
    document.addEventListener('selectionchange', updateFromSelection)
    return () => document.removeEventListener('selectionchange', updateFromSelection)
  }, [])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('.pt-title-text')) return
      if (target.closest('.pt-fmt')) return
      setAnchor(null)
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [])

  useEffect(() => {
    function onFocusIn() {
      const active = document.activeElement as HTMLElement | null
      if (!active) return
      if (active.classList?.contains('pt-title-text')) return
      if (active.closest?.('.pt-fmt')) return
      setAnchor(null)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])

  useLayoutEffect(() => {
    if (!anchor) {
      setPos(null)
      return
    }
    const el = ref.current
    const width = el?.offsetWidth ?? 260
    const vw = window.innerWidth
    let left = anchor.centerX - width / 2
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN))
    let top = anchor.top - TOOLBAR_HEIGHT - 6
    if (top < MARGIN) top = anchor.top + 22
    setPos({ top, left })
  }, [anchor])

  if (!anchor) return null

  return (
    <div
      ref={ref}
      className="pt-fmt"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden'
      }}
      onMouseDown={e => e.preventDefault()}
    >
      <button className="pt-fmt-btn b" onClick={() => exec('bold')} title="Bold">B</button>
      <button className="pt-fmt-btn i" onClick={() => exec('italic')} title="Italic">I</button>
      <button className="pt-fmt-btn u" onClick={() => exec('underline')} title="Underline">U</button>
      <button className="pt-fmt-btn s" onClick={() => exec('strikeThrough')} title="Strikethrough">S</button>
      <div className="pt-fmt-sep" />
      {SWATCHES.map(s => (
        <button
          key={s.name ?? 'none'}
          className={`pt-fmt-swatch${s.name === null ? ' none' : ''}`}
          style={s.varName ? { background: s.varName } : undefined}
          onClick={() => applyColor(s.name)}
          title={s.aria}
          aria-label={s.aria}
        />
      ))}
    </div>
  )
}
