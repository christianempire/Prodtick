export type TaskId = string

// Marks a task that was ingested from an external source (e.g. a finished
// Claude Code session) rather than created by hand. `sessionId` is the upsert
// key: later iterations of the same session update the same task in place.
export interface TaskSource {
  kind: 'claude-code'
  sessionId: string
  project: string
  // Start time (epoch ms) of the session segment this task belongs to. A gap of
  // more than a few hours between turns of one session starts a new segment (and
  // thus a new task), so this is part of the upsert identity, not just metadata.
  segmentStart?: number
}

export interface Task {
  id: TaskId
  html: string
  createdAt: number
  completedAt: number | null
  source?: TaskSource // present only for externally-ingested tasks
}

// 0 = Sunday … 6 = Saturday (JavaScript getDay() convention).
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface WeeklyReportSettings {
  enabled: boolean
  dayOfWeek: DayOfWeek
  hour: number   // 0..23 local
  minute: number // 0..59 local
  notify: boolean
}

// Ingestion of finished Claude Code sessions dropped into the inbox folder.
export interface ClaudeCodeSettings {
  enabled: boolean // master switch for inbox ingestion
  projectAllowlist: string[] // empty = accept all projects
}

export interface Settings {
  launchOnStartup: boolean
  startMinimized: boolean
  showOverlay: boolean
  darkMode: boolean
  weeklyReport: WeeklyReportSettings
  claudeCode: ClaudeCodeSettings
}

export interface WeeklyReportCompletion {
  ts: number
  html: string
}

export interface WeeklyReport {
  id: string
  // Window covered (Monday 00:00 local through following Sunday 23:59:59.999 local).
  weekStart: number
  weekEnd: number
  generatedAt: number
  total: number
  prior: number
  delta: number
  days: [number, number, number, number, number, number, number] // Mon..Sun
  peakDayIndex: number // 0..6, Mon..Sun, -1 when total === 0
  peakCount: number
  avg4: number // 4-week average ending at this week (inclusive)
  streakAtEnd: number // streak in days as-of weekEnd
  headline: string // italic-serif one-liner
  pull: string // celebratory or nudging pull-quote
  completions: WeeklyReportCompletion[]
  seen: boolean
}

export interface ProdtickData {
  active: Task[]
  done: Task[]
  archive: Task[]
  reports: WeeklyReport[]
  settings: Settings
}

export interface ProdtickApi {
  getData: () => Promise<ProdtickData>
  addTask: (html: string) => Promise<ProdtickData>
  updateTask: (id: TaskId, patch: { html: string }) => Promise<ProdtickData>
  deleteTask: (id: TaskId) => Promise<ProdtickData>
  tickTask: (id: TaskId) => Promise<ProdtickData>
  untickTask: (id: TaskId) => Promise<ProdtickData>
  reorderActive: (orderedIds: TaskId[]) => Promise<ProdtickData>
  archiveCompleted: () => Promise<ProdtickData>
  archiveOne: (id: TaskId) => Promise<ProdtickData>
  deleteArchived: (id: TaskId) => Promise<ProdtickData>
  clearArchive: () => Promise<ProdtickData>
  restoreArchived: (id: TaskId) => Promise<ProdtickData>
  setCompletedAt: (id: TaskId, ts: number) => Promise<ProdtickData>
  setSettings: (patch: Partial<Settings>) => Promise<ProdtickData>
  setWeeklyReportSettings: (patch: Partial<WeeklyReportSettings>) => Promise<ProdtickData>
  generateReportNow: () => Promise<ProdtickData>
  markReportSeen: (id: string) => Promise<ProdtickData>
  deleteReport: (id: string) => Promise<ProdtickData>
  showMainWindow: () => Promise<void>
  isPackaged: () => Promise<boolean>
  windowMinimize: () => Promise<void>
  windowMaximizeToggle: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  overlayHide: () => Promise<void>
  onData: (cb: (d: ProdtickData) => void) => () => void
  onMaximized: (cb: (m: boolean) => void) => () => void
  onShowReport: (cb: (reportId: string) => void) => () => void
}

declare global {
  interface Window {
    prodtick: ProdtickApi
  }
}
