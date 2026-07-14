import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import type {
  ClaudeCodeSettings,
  ProdtickData,
  Settings,
  Task,
  TaskId,
  TaskSource,
  WeeklyReport,
  WeeklyReportSettings
} from '@shared/types'

const DEFAULT_WEEKLY_REPORT: WeeklyReportSettings = {
  enabled: true,
  dayOfWeek: 1, // Monday
  hour: 12,
  minute: 0,
  notify: true
}

const DEFAULT_CLAUDE_CODE: ClaudeCodeSettings = {
  enabled: true,
  projectAllowlist: []
}

const DEFAULT_SETTINGS: Settings = {
  launchOnStartup: false,
  startMinimized: false,
  showOverlay: false,
  darkMode: true,
  weeklyReport: { ...DEFAULT_WEEKLY_REPORT },
  claudeCode: { ...DEFAULT_CLAUDE_CODE }
}

function makeDefault(): ProdtickData {
  return { active: [], done: [], archive: [], reports: [], settings: { ...DEFAULT_SETTINGS } }
}

const store = new Store<{ data: ProdtickData }>({ name: 'prodtick-data' })

let cache: ProdtickData = (() => {
  const existing = store.get('data') as ProdtickData | undefined
  if (!existing) {
    const fresh = makeDefault()
    store.set('data', fresh)
    return fresh
  }
  return {
    active: existing.active ?? [],
    done: existing.done ?? [],
    archive: existing.archive ?? [],
    reports: existing.reports ?? [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(existing.settings ?? {}),
      weeklyReport: { ...DEFAULT_WEEKLY_REPORT, ...(existing.settings?.weeklyReport ?? {}) },
      claudeCode: { ...DEFAULT_CLAUDE_CODE, ...(existing.settings?.claudeCode ?? {}) }
    }
  }
})()

function save() {
  store.set('data', cache)
}

export function getData(): ProdtickData {
  return cache
}

function makeTask(html: string): Task {
  return { id: randomUUID(), html, createdAt: Date.now(), completedAt: null }
}

export function addTask(html: string): ProdtickData {
  // Prepend so the newest task is at the top. Existing manual order is preserved.
  cache = { ...cache, active: [makeTask(html), ...cache.active] }
  save()
  return cache
}

export function updateTask(id: TaskId, html: string): ProdtickData {
  const map = (t: Task) => (t.id === id ? { ...t, html } : t)
  cache = { ...cache, active: cache.active.map(map), done: cache.done.map(map) }
  save()
  return cache
}

export function deleteTask(id: TaskId): ProdtickData {
  cache = {
    ...cache,
    active: cache.active.filter(t => t.id !== id),
    done: cache.done.filter(t => t.id !== id)
  }
  save()
  return cache
}

export function tickTask(id: TaskId): ProdtickData {
  const task = cache.active.find(t => t.id === id)
  if (!task) return cache
  const ticked: Task = { ...task, completedAt: Date.now() }
  cache = {
    ...cache,
    active: cache.active.filter(t => t.id !== id),
    done: [ticked, ...cache.done]
  }
  save()
  return cache
}

export function untickTask(id: TaskId): ProdtickData {
  const task = cache.done.find(t => t.id === id)
  if (!task) return cache
  const restored: Task = { ...task, completedAt: null }
  cache = {
    ...cache,
    done: cache.done.filter(t => t.id !== id),
    active: [restored, ...cache.active]
  }
  save()
  return cache
}

// Ingest a finished external session as a completed task, keyed by its source
// session id. First sighting creates a new done task; later iterations of the
// same session update the existing task's content in place. The task is re-homed
// respectfully: if the user has archived or reopened (un-ticked) it, it stays
// where they put it rather than being forced back into `done`.
export function upsertExternalDone(input: {
  source: TaskSource
  html: string
  completedAt: number
}): { data: ProdtickData; created: boolean } {
  // Identity is (session, segment): a later burst of the same session (after a
  // long gap) carries a different segmentStart and so becomes its own task.
  const matches = (t: Task) =>
    t.source?.kind === input.source.kind &&
    t.source.sessionId === input.source.sessionId &&
    (t.source.segmentStart ?? null) === (input.source.segmentStart ?? null)
  const stamp = Math.floor(input.completedAt)

  const inActive = cache.active.find(matches)
  const inDone = cache.done.find(matches)
  const inArchive = cache.archive.find(matches)
  const existing = inActive ?? inDone ?? inArchive

  if (!existing) {
    const task: Task = {
      id: randomUUID(),
      html: input.html,
      createdAt: Date.now(),
      completedAt: stamp,
      source: { ...input.source }
    }
    cache = { ...cache, done: [task, ...cache.done] }
    save()
    return { data: cache, created: true }
  }

  const updated: Task = {
    ...existing,
    html: input.html,
    completedAt: stamp,
    source: { ...input.source } // keep project fresh
  }
  let next: ProdtickData = {
    ...cache,
    active: cache.active.filter(t => !matches(t)),
    done: cache.done.filter(t => !matches(t)),
    archive: cache.archive.filter(t => !matches(t))
  }
  if (inArchive) next = { ...next, archive: [updated, ...next.archive] }
  else if (inActive) next = { ...next, active: [updated, ...next.active] }
  else next = { ...next, done: [updated, ...next.done] }

  cache = next
  save()
  return { data: cache, created: false }
}

export function reorderActive(orderedIds: TaskId[]): ProdtickData {
  const byId = new Map(cache.active.map(t => [t.id, t]))
  const next: Task[] = []
  for (const id of orderedIds) {
    const t = byId.get(id)
    if (t) {
      next.push(t)
      byId.delete(id)
    }
  }
  for (const leftover of byId.values()) next.push(leftover)
  cache = { ...cache, active: next }
  save()
  return cache
}

export function archiveCompleted(): ProdtickData {
  if (cache.done.length === 0) return cache
  cache = { ...cache, archive: [...cache.done, ...cache.archive], done: [] }
  save()
  return cache
}

export function archiveOne(id: TaskId): ProdtickData {
  const task = cache.done.find(t => t.id === id)
  if (!task) return cache
  cache = {
    ...cache,
    done: cache.done.filter(t => t.id !== id),
    archive: [task, ...cache.archive]
  }
  save()
  return cache
}

export function deleteArchived(id: TaskId): ProdtickData {
  cache = { ...cache, archive: cache.archive.filter(t => t.id !== id) }
  save()
  return cache
}

export function clearArchive(): ProdtickData {
  if (cache.archive.length === 0) return cache
  cache = { ...cache, archive: [] }
  save()
  return cache
}

export function setCompletedAt(id: TaskId, ts: number): ProdtickData {
  const stamp = Math.floor(ts)
  const map = (t: Task) => (t.id === id ? { ...t, completedAt: stamp } : t)
  cache = {
    ...cache,
    done: cache.done.map(map),
    archive: cache.archive.map(map)
  }
  save()
  return cache
}

export function restoreArchived(id: TaskId): ProdtickData {
  const task = cache.archive.find(t => t.id === id)
  if (!task) return cache
  const restored: Task = { ...task, completedAt: null }
  cache = {
    ...cache,
    archive: cache.archive.filter(t => t.id !== id),
    active: [restored, ...cache.active]
  }
  save()
  return cache
}

export function setSettings(patch: Partial<Settings>): ProdtickData {
  cache = { ...cache, settings: { ...cache.settings, ...patch } }
  save()
  return cache
}

export function setWeeklyReportSettings(patch: Partial<WeeklyReportSettings>): ProdtickData {
  cache = {
    ...cache,
    settings: {
      ...cache.settings,
      weeklyReport: { ...cache.settings.weeklyReport, ...patch }
    }
  }
  save()
  return cache
}

export function addReport(report: WeeklyReport): ProdtickData {
  // Newest first. If a report for the same window already exists, replace it
  // (idempotent: re-running for the same week updates instead of duplicating).
  const filtered = cache.reports.filter(r => r.weekStart !== report.weekStart)
  cache = { ...cache, reports: [report, ...filtered] }
  save()
  return cache
}

export function markReportSeen(id: string): ProdtickData {
  cache = {
    ...cache,
    reports: cache.reports.map(r => (r.id === id ? { ...r, seen: true } : r))
  }
  save()
  return cache
}

export function deleteReport(id: string): ProdtickData {
  cache = { ...cache, reports: cache.reports.filter(r => r.id !== id) }
  save()
  return cache
}
