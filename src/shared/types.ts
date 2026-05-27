export type TaskId = string

export interface Task {
  id: TaskId
  html: string
  createdAt: number
  completedAt: number | null
}

export interface Settings {
  launchOnStartup: boolean
  startMinimized: boolean
  showOverlay: boolean
  darkMode: boolean
}

export interface ProdtickData {
  active: Task[]
  done: Task[]
  archive: Task[]
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
  showMainWindow: () => Promise<void>
  isPackaged: () => Promise<boolean>
  windowMinimize: () => Promise<void>
  windowMaximizeToggle: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  overlayHide: () => Promise<void>
  overlayResize: (height: number) => Promise<void>
  onData: (cb: (d: ProdtickData) => void) => () => void
  onMaximized: (cb: (m: boolean) => void) => () => void
}

declare global {
  interface Window {
    prodtick: ProdtickApi
  }
}
