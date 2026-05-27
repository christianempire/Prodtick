export type ColorName = 'red' | 'orange' | 'yellow' | 'jade' | 'blue' | 'violet'

const ALLOWED_TAGS = new Set(['B', 'I', 'U', 'S', 'STRIKE', 'SPAN', 'BR', 'EM', 'STRONG', 'FONT'])
const ALLOWED_COLORS: Set<string> = new Set(['red', 'orange', 'yellow', 'jade', 'blue', 'violet'])

export function sanitizeHtml(input: string): string {
  const container = document.createElement('div')
  container.innerHTML = input
  walk(container)
  return container.innerHTML
}

function walk(node: Node) {
  const children = Array.from(node.childNodes)
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.parentNode?.removeChild(child)
      continue
    }
    const el = child as HTMLElement
    if (!ALLOWED_TAGS.has(el.tagName)) {
      const text = document.createTextNode(el.textContent ?? '')
      el.parentNode?.replaceChild(text, el)
      continue
    }

    // Normalize legacy <font color=...> -> span data-color (best-effort name match)
    if (el.tagName === 'FONT') {
      const span = document.createElement('span')
      const colorAttr = el.getAttribute('color')
      const name = colorAttr ? matchColorName(colorAttr) : null
      if (name) span.setAttribute('data-color', name)
      while (el.firstChild) span.appendChild(el.firstChild)
      el.parentNode?.replaceChild(span, el)
      walk(span)
      continue
    }

    // Normalize <strike> -> <s>
    if (el.tagName === 'STRIKE') {
      const s = document.createElement('s')
      while (el.firstChild) s.appendChild(el.firstChild)
      el.parentNode?.replaceChild(s, el)
      walk(s)
      continue
    }

    // For spans, allow data-color (whitelisted values) and an inline style color
    // converted to data-color when it matches a known palette color.
    if (el.tagName === 'SPAN') {
      let dataColor = el.getAttribute('data-color')
      const styleColor = el.style?.color
      if (!dataColor && styleColor) {
        dataColor = matchColorName(styleColor)
      }
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
      if (dataColor && ALLOWED_COLORS.has(dataColor)) {
        el.setAttribute('data-color', dataColor)
      } else {
        // No recognized color — unwrap the span
        while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el)
        el.parentNode?.removeChild(el)
        continue
      }
    } else {
      // Strip all attributes from non-span allowed tags.
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
    }
    walk(el)
  }
}

// Tolerant mapper from arbitrary color strings (hex, rgb, named) to a palette name.
function matchColorName(raw: string): ColorName | null {
  const probe = document.createElement('span')
  probe.style.color = raw
  document.body.appendChild(probe)
  const rgb = getComputedStyle(probe).color
  document.body.removeChild(probe)
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!m) return null
  const r = +m[1]
  const g = +m[2]
  const b = +m[3]
  // Heuristic by hue
  if (r > 180 && g < 130 && b < 130) return 'red'
  if (r > 200 && g > 130 && b < 130) return 'orange'
  if (r > 200 && g > 180 && b < 130) return 'yellow'
  if (g > 150 && r < 180 && b < 180) return 'jade'
  if (b > 180 && r < 180) return 'blue'
  if (r > 130 && b > 150 && g < 150) return 'violet'
  return null
}

export type FormatCmd = 'bold' | 'italic' | 'underline' | 'strikeThrough'

export function exec(cmd: FormatCmd) {
  document.execCommand(cmd, false)
}

// Wraps the current selection in a <span data-color="…">, or unwraps if name is null.
export function applyColor(name: ColorName | null) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
  const range = sel.getRangeAt(0)

  if (name === null) {
    // Try to remove a wrapping span[data-color] that contains the selection.
    const ancestor = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as HTMLElement)
      : range.commonAncestorContainer.parentElement) as HTMLElement | null
    const span = ancestor?.closest?.('span[data-color]') as HTMLElement | null
    if (span) {
      const parent = span.parentNode
      if (parent) {
        while (span.firstChild) parent.insertBefore(span.firstChild, span)
        parent.removeChild(span)
      }
    }
    return
  }

  const span = document.createElement('span')
  span.setAttribute('data-color', name)
  span.appendChild(range.extractContents())
  range.insertNode(span)

  // Reselect the wrapped content
  sel.removeAllRanges()
  const newRange = document.createRange()
  newRange.selectNodeContents(span)
  sel.addRange(newRange)
}
