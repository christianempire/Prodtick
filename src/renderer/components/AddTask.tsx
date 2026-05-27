import { useRef } from 'react'
import { prodtick } from '../api'
import { sanitizeHtml } from '../lib/format'

interface Props {
  placeholder?: string
  /** Use the overlay's flat input shell instead of the ledger row. */
  overlay?: boolean
  autoFocus?: boolean
}

export default function AddTask({
  placeholder = 'Add a task — enter to save',
  overlay = false,
  autoFocus = false
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  const submit = () => {
    const el = ref.current
    if (!el) return
    const text = (el.textContent ?? '').trim()
    if (!text) return
    const clean = sanitizeHtml(el.innerHTML).trim()
    prodtick.addTask(clean || text)
    el.innerHTML = ''
  }

  const editable = (
    <div
      ref={ref}
      className={`pt-title-text ${overlay ? 'pt-overlay-add-field' : 'pt-add-input'}`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      autoFocus={autoFocus}
      onInput={() => {
        // Reset to truly-empty innerHTML so the :empty placeholder reappears
        // after the user deletes everything (browsers leave a stray <br>).
        const el = ref.current
        if (el && el.textContent === '' && el.innerHTML !== '') el.innerHTML = ''
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          submit()
        } else if (e.key === 'Escape') {
          if (ref.current) ref.current.innerHTML = ''
        }
      }}
    />
  )

  if (overlay) {
    return (
      <div className="pt-overlay-add">
        <span className="plus">＋</span>
        {editable}
      </div>
    )
  }

  return (
    <div className="pt-add">
      <div className="pt-add-plus">＋</div>
      {editable}
    </div>
  )
}
