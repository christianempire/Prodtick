import type { WeeklyReport } from '@shared/types'
import { sanitizeHtml } from '../../lib/format'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function dateline(report: WeeklyReport): string {
  const s = new Date(report.weekStart)
  const e = new Date(report.weekEnd)
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }).toUpperCase()
  return `${fmt(s)} — ${fmt(e)}`
}

export function fullDateline(report: WeeklyReport): string {
  return `${dateline(report)}, ${new Date(report.weekEnd).getFullYear()}`
}

export function completionTag(ts: number): string {
  const d = new Date(ts)
  // Mon..Sun → 0..6
  const day = (d.getDay() + 6) % 7
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${DAY_NAMES[day].toUpperCase()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function safeHtml(html: string): string {
  return sanitizeHtml(html)
}

export function compareLine(report: WeeklyReport): string {
  const parts: string[] = []
  if (report.avg4 > 0) {
    const pct = Math.round(((report.total - report.avg4) / report.avg4) * 100)
    if (pct === 0) parts.push(`level with your 4-week average`)
    else if (pct > 0) parts.push(`${pct}% above your 4-week average`)
    else parts.push(`${Math.abs(pct)}% below your 4-week average`)
  } else if (report.total > 0) {
    parts.push(`first counted week in a month`)
  }
  if (report.streakAtEnd > 0) {
    parts.push(`streak now ${report.streakAtEnd} day${report.streakAtEnd === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

export function nextDeliveryHint(
  generatedAt: number,
  dayOfWeek: number,
  hour: number,
  minute: number
): string {
  const next = new Date(generatedAt)
  for (let i = 1; i < 9; i++) {
    const c = new Date(generatedAt)
    c.setDate(c.getDate() + i)
    if (c.getDay() === dayOfWeek) {
      c.setHours(hour, minute, 0, 0)
      next.setTime(c.getTime())
      break
    }
  }
  const w = next.toLocaleDateString(undefined, { weekday: 'short' })
  const md = next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
  return `Next report ${w} ${md}, ${time}`
}

export function deltaSymbol(n: number): string {
  if (n === 0) return '±0'
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`
}
