import { randomUUID } from 'node:crypto'
import type {
  DayOfWeek,
  ProdtickData,
  Task,
  WeeklyReport,
  WeeklyReportCompletion,
  WeeklyReportSettings
} from '@shared/types'

const DAY_MS = 24 * 60 * 60 * 1000

// Start of `d`'s local day.
function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

// Index Mon=0..Sun=6 (matches the ribbon's display order).
function monIndex(date: Date): number {
  // getDay(): Sun=0..Sat=6 → Mon=0..Sun=6
  const day = date.getDay()
  return (day + 6) % 7
}

// Monday 00:00:00 of the ISO week containing `date` (in local time).
function startOfIsoWeek(date: Date): Date {
  const s = startOfDay(date)
  s.setDate(s.getDate() - monIndex(s))
  return s
}

// The most recent scheduled delivery instant <= `now`.
// Returns null if no schedule has ever fired (i.e. now is earlier than the
// first weekly trigger after the user installed — unreachable in practice).
export function lastDeliveryAt(now: number, ws: WeeklyReportSettings): number {
  const d = new Date(now)
  // Walk back day-by-day looking for the most recent matching weekday whose
  // (hour, minute) instant is at or before `now`. At most 7 iterations.
  for (let i = 0; i < 8; i++) {
    const cand = new Date(d)
    cand.setDate(d.getDate() - i)
    if (cand.getDay() !== ws.dayOfWeek) continue
    cand.setHours(ws.hour, ws.minute, 0, 0)
    if (cand.getTime() <= now) return cand.getTime()
  }
  // Fallback: 7 days ago at the configured time.
  const fallback = new Date(now - 7 * DAY_MS)
  fallback.setHours(ws.hour, ws.minute, 0, 0)
  return fallback.getTime()
}

// The next scheduled delivery instant strictly after `now`.
export function nextDeliveryAt(now: number, ws: WeeklyReportSettings): number {
  const d = new Date(now)
  for (let i = 0; i < 8; i++) {
    const cand = new Date(d)
    cand.setDate(d.getDate() + i)
    if (cand.getDay() !== ws.dayOfWeek) continue
    cand.setHours(ws.hour, ws.minute, 0, 0)
    if (cand.getTime() > now) return cand.getTime()
  }
  const fallback = new Date(now + 7 * DAY_MS)
  fallback.setHours(ws.hour, ws.minute, 0, 0)
  return fallback.getTime()
}

// Given a delivery instant, return the Mon–Sun window that the report covers:
// the most recent complete ISO week ending strictly before the delivery instant.
export function weekWindowForDelivery(deliveryAt: number): {
  weekStart: number
  weekEnd: number
} {
  const d = new Date(deliveryAt)
  const thisWeekStart = startOfIsoWeek(d)
  // The window we're reporting on is the prior Mon–Sun, ending the Sunday
  // before this Monday. Even if delivery is later in the week (configurable),
  // we always look one full week back so the user gets a complete picture.
  const prevWeekStart = new Date(thisWeekStart)
  prevWeekStart.setDate(thisWeekStart.getDate() - 7)
  const weekEnd = new Date(thisWeekStart.getTime() - 1) // 23:59:59.999 Sunday
  return { weekStart: prevWeekStart.getTime(), weekEnd: weekEnd.getTime() }
}

function completionsInWindow(data: ProdtickData, start: number, end: number): Task[] {
  const all = [...data.done, ...data.archive]
  return all
    .filter(t => t.completedAt !== null)
    .filter(t => (t.completedAt as number) >= start && (t.completedAt as number) <= end)
    .sort((a, b) => (a.completedAt as number) - (b.completedAt as number))
}

function dayCounts(tasks: Task[], weekStart: number): WeeklyReport['days'] {
  const days: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0]
  for (const t of tasks) {
    const idx = Math.floor(((t.completedAt as number) - weekStart) / DAY_MS)
    if (idx >= 0 && idx < 7) days[idx]++
  }
  return days
}

function fourWeekAverage(data: ProdtickData, currentWeekStart: number): number {
  // Average over the 4 most recent complete weeks ending at currentWeekStart
  // (i.e. currentWeekStart, currentWeekStart-7d, -14d, -21d).
  let sum = 0
  for (let i = 0; i < 4; i++) {
    const ws = currentWeekStart - i * 7 * DAY_MS
    const we = ws + 7 * DAY_MS - 1
    sum += completionsInWindow(data, ws, we).length
  }
  return Math.round(sum / 4)
}

function streakAsOf(data: ProdtickData, endTs: number): number {
  const all = [...data.done, ...data.archive]
    .map(t => t.completedAt)
    .filter((ts): ts is number => ts !== null && ts <= endTs)
  if (all.length === 0) return 0
  const dayKeys = new Set<string>()
  for (const ts of all) {
    const d = new Date(ts)
    d.setHours(0, 0, 0, 0)
    dayKeys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }
  let streak = 0
  const cursor = new Date(endTs)
  cursor.setHours(0, 0, 0, 0)
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`
    if (dayKeys.has(key)) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

function pickHeadline(total: number, delta: number, peakCount: number): string {
  if (total === 0) return "a fallow week — that's allowed"
  if (delta >= 15) return 'your strongest yet'
  if (delta >= 5) return 'a steady, useful week'
  if (delta >= -2) return 'a steady week'
  if (delta >= -10) return 'a quieter stretch'
  if (peakCount === 0) return 'a slow week'
  return 'a smaller week — onward'
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function pickPullQuote(
  total: number,
  days: WeeklyReport['days'],
  peakDayIndex: number,
  peakCount: number
): string {
  if (total === 0) return 'Pick one small thing today. The page is patient.'
  if (peakDayIndex < 0) return 'A few quiet ticks — every one of them counted.'
  const dayName = DAY_NAMES[peakDayIndex]
  const above5 = days.filter(n => n >= 5).length
  if (above5 >= 4) return `Four days above five. A rare, sustained run.`
  if (peakCount >= 10) return `${dayName} carried the week — ${peakCount} ticks in a single day.`
  if (peakCount >= 6) return `${dayName} did the heavy lifting, and the rest held steady.`
  return `Small, even days — ${dayName} the brightest of them.`
}

export interface BuildReportInput {
  data: ProdtickData
  deliveryAt: number
}

export function buildReport(input: BuildReportInput): WeeklyReport {
  const { data, deliveryAt } = input
  const { weekStart, weekEnd } = weekWindowForDelivery(deliveryAt)

  const thisWeekTasks = completionsInWindow(data, weekStart, weekEnd)
  const priorStart = weekStart - 7 * DAY_MS
  const priorEnd = weekStart - 1
  const priorWeekTasks = completionsInWindow(data, priorStart, priorEnd)

  const total = thisWeekTasks.length
  const prior = priorWeekTasks.length
  const delta = total - prior

  const days = dayCounts(thisWeekTasks, weekStart)
  let peakDayIndex = -1
  let peakCount = 0
  for (let i = 0; i < 7; i++) {
    if (days[i] > peakCount) {
      peakCount = days[i]
      peakDayIndex = i
    }
  }

  const avg4 = fourWeekAverage(data, weekStart)
  const streakAtEnd = streakAsOf(data, weekEnd)
  const headline = pickHeadline(total, delta, peakCount)
  const pull = pickPullQuote(total, days, peakDayIndex, peakCount)

  // Sample up to 5 completions. Prefer one per day across the week, falling
  // back to most recent first when we don't have full coverage.
  const completions: WeeklyReportCompletion[] = pickCompletions(thisWeekTasks)

  return {
    id: randomUUID(),
    weekStart,
    weekEnd,
    generatedAt: deliveryAt,
    total,
    prior,
    delta,
    days,
    peakDayIndex,
    peakCount,
    avg4,
    streakAtEnd,
    headline,
    pull,
    completions,
    seen: false
  }
}

function pickCompletions(tasks: Task[]): WeeklyReportCompletion[] {
  if (tasks.length === 0) return []
  // Sample one per distinct day (by local day index), most recent first per day.
  const byDay = new Map<number, Task>()
  for (const t of tasks) {
    const d = new Date(t.completedAt as number)
    const key = d.getFullYear() * 1000 + d.getMonth() * 32 + d.getDate()
    if (!byDay.has(key)) byDay.set(key, t)
  }
  const sampled = Array.from(byDay.values())
    .sort((a, b) => (a.completedAt as number) - (b.completedAt as number))
    .slice(0, 5)
  // If we got fewer than 5 days, top up with the latest remaining tasks.
  if (sampled.length < 5) {
    const used = new Set(sampled.map(t => t.id))
    const extras = [...tasks].reverse().filter(t => !used.has(t.id))
    for (const e of extras) {
      sampled.push(e)
      if (sampled.length >= 5) break
    }
  }
  return sampled
    .sort((a, b) => (a.completedAt as number) - (b.completedAt as number))
    .map(t => ({ ts: t.completedAt as number, html: t.html }))
}

export function shouldDeliverNow(
  now: number,
  ws: WeeklyReportSettings,
  reports: WeeklyReport[]
): { deliver: boolean; deliveryAt: number } {
  const deliveryAt = lastDeliveryAt(now, ws)
  if (now < deliveryAt) return { deliver: false, deliveryAt }
  // If we already delivered for this scheduled instant (or later), skip.
  const latest = reports[0]?.generatedAt ?? 0
  if (latest >= deliveryAt) return { deliver: false, deliveryAt }
  return { deliver: true, deliveryAt }
}

export function describeWindow(weekStart: number, weekEnd: number): string {
  const s = new Date(weekStart)
  const e = new Date(weekEnd)
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }).toUpperCase()
  return `${fmt(s)} — ${fmt(e)}, ${e.getFullYear()}`
}

// Picks a one-line notification body from the report.
export function notificationBody(report: WeeklyReport): string {
  if (report.total === 0) return 'A quiet week — open Prodtick for a gentle nudge.'
  const parts = [`${report.total} ${report.total === 1 ? 'tick' : 'ticks'}`]
  if (report.peakDayIndex >= 0 && report.peakCount > 0) {
    parts.push(`peak ${DAY_NAMES[report.peakDayIndex]} at ${report.peakCount}`)
  }
  if (report.delta > 0) parts.push(`+${report.delta} vs prior`)
  else if (report.delta < 0) parts.push(`${report.delta} vs prior`)
  return parts.join(' · ')
}

// Exposed for tests / debugging.
export const _internals = { monIndex, startOfIsoWeek, DAY_MS, DAY_NAMES, pickCompletions } as Record<
  string,
  unknown
> & { DAY_NAMES: string[]; pickCompletions: typeof pickCompletions; monIndex: (d: Date) => number }

export type _DayOfWeek = DayOfWeek
