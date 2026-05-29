import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { ProdtickApi, ProdtickData, TaskId, Settings, WeeklyReportSettings } from '@shared/types'

const api: ProdtickApi = {
  getData: () => ipcRenderer.invoke(IPC.getData),
  addTask: html => ipcRenderer.invoke(IPC.addTask, html),
  updateTask: (id: TaskId, patch) => ipcRenderer.invoke(IPC.updateTask, id, patch),
  deleteTask: id => ipcRenderer.invoke(IPC.deleteTask, id),
  tickTask: id => ipcRenderer.invoke(IPC.tickTask, id),
  untickTask: id => ipcRenderer.invoke(IPC.untickTask, id),
  reorderActive: ids => ipcRenderer.invoke(IPC.reorderActive, ids),
  archiveCompleted: () => ipcRenderer.invoke(IPC.archiveCompleted),
  archiveOne: id => ipcRenderer.invoke(IPC.archiveOne, id),
  deleteArchived: id => ipcRenderer.invoke(IPC.deleteArchived, id),
  clearArchive: () => ipcRenderer.invoke(IPC.clearArchive),
  restoreArchived: id => ipcRenderer.invoke(IPC.restoreArchived, id),
  setCompletedAt: (id, ts) => ipcRenderer.invoke(IPC.setCompletedAt, id, ts),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.setSettings, patch),
  setWeeklyReportSettings: (patch: Partial<WeeklyReportSettings>) =>
    ipcRenderer.invoke(IPC.setWeeklyReportSettings, patch),
  generateReportNow: () => ipcRenderer.invoke(IPC.generateReportNow),
  markReportSeen: (id: string) => ipcRenderer.invoke(IPC.markReportSeen, id),
  deleteReport: (id: string) => ipcRenderer.invoke(IPC.deleteReport, id),
  showMainWindow: () => ipcRenderer.invoke(IPC.showMain),
  isPackaged: () => ipcRenderer.invoke(IPC.isPackaged),
  windowMinimize: () => ipcRenderer.invoke(IPC.windowMinimize),
  windowMaximizeToggle: () => ipcRenderer.invoke(IPC.windowMaximizeToggle),
  windowClose: () => ipcRenderer.invoke(IPC.windowClose),
  windowIsMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized),
  overlayHide: () => ipcRenderer.invoke(IPC.overlayHide),
  onData: cb => {
    const handler = (_e: Electron.IpcRendererEvent, d: ProdtickData) => cb(d)
    ipcRenderer.on(IPC.data, handler)
    return () => ipcRenderer.removeListener(IPC.data, handler)
  },
  onMaximized: cb => {
    const handler = (_e: Electron.IpcRendererEvent, m: boolean) => cb(m)
    ipcRenderer.on(IPC.maximized, handler)
    return () => ipcRenderer.removeListener(IPC.maximized, handler)
  },
  onShowReport: cb => {
    const handler = (_e: Electron.IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on(IPC.showReport, handler)
    return () => ipcRenderer.removeListener(IPC.showReport, handler)
  }
}

contextBridge.exposeInMainWorld('prodtick', api)
