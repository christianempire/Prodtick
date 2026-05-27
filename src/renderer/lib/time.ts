const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts
  if (diff < 0) return 'just now'
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE)
    return `${m}m ago`
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR)
    return `${h}h ago`
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY)
    return `${d}d ago`
  }
  return formatShortDate(ts)
}

// Compact: "1m", "1h", "5d", or "May 24" if older than a week. No "ago" suffix.
// Returns `null` when the input is so fresh we'd rather render "now" — callers
// can decide how to present that.
export function compactDelta(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts)
  if (diff < MINUTE) return 'now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`
  return formatShortDate(ts)
}

export function formatShortDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatFullDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

// Returns a YYYY-MM-DD bucket key using the local day boundary.
export function dayKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Generates the last N day keys ending today, in chronological order.
export function lastNDayKeys(n: number, now: number = Date.now()): string[] {
  const out: string[] = []
  const base = new Date(now)
  base.setHours(0, 0, 0, 0)
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(base.getDate() - i)
    out.push(dayKey(d.getTime()))
  }
  return out
}

export function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

// Compares two dayKeys (YYYY-MM-DD): returns -1, 0, 1.
export function compareDayKey(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1
}

// `<input type="datetime-local">` uses YYYY-MM-DDTHH:mm in *local* time.
export function toDatetimeLocal(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

export function fromDatetimeLocal(s: string): number | null {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : null
}
