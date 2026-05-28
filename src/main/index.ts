import { app, BrowserWindow, ipcMain, shell, screen, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Force Chromium's UI locale to British English so the native
// `<input type="datetime-local">` picker renders dd/mm/yyyy regardless of the
// user's Windows regional setting. Must be set before app.whenReady.
app.commandLine.appendSwitch('lang', 'en-GB')
import {
  addTask,
  archiveCompleted,
  archiveOne,
  clearArchive,
  deleteArchived,
  deleteReport,
  deleteTask,
  getData,
  markReportSeen,
  reorderActive,
  restoreArchived,
  setCompletedAt,
  setSettings,
  setWeeklyReportSettings,
  tickTask,
  untickTask,
  updateTask
} from './dataStore'
import { destroyTray, ensureTray, refreshMenu } from './tray'
import { generateNow, startScheduler, stopScheduler } from './scheduler'
import { IPC } from '@shared/ipc'
import type { ProdtickData, Settings, TaskId, WeeklyReport, WeeklyReportSettings } from '@shared/types'

const LAUNCH_HIDDEN = process.argv.includes('--hidden')

function appIconPath(): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'icons')
    : join(app.getAppPath(), 'resources', 'icons')
  return join(base, 'app.ico')
}

function appIcon(): Electron.NativeImage | undefined {
  const p = appIconPath()
  return existsSync(p) ? nativeImage.createFromPath(p) : undefined
}

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

function settings(): Settings {
  return getData().settings
}

function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function broadcastData(d: ProdtickData) {
  broadcast(IPC.data, d)
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }
  mainWindow = new BrowserWindow({
    width: 760,
    height: 720,
    minWidth: 520,
    minHeight: 480,
    show: !settings().startMinimized && !LAUNCH_HIDDEN,
    backgroundColor: '#0B0E18',
    frame: false,
    autoHideMenuBar: true,
    icon: appIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mainWindow.on('close', e => {
    if (!(app as { isQuiting?: boolean }).isQuiting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  const broadcastMaximized = () => {
    if (!mainWindow) return
    broadcast(IPC.maximized, mainWindow.isMaximized())
  }
  mainWindow.on('maximize', broadcastMaximized)
  mainWindow.on('unmaximize', broadcastMaximized)
  mainWindow.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/index.html')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show()
    return
  }
  const display = screen.getPrimaryDisplay().workArea
  overlayWindow = new BrowserWindow({
    width: 320,
    height: 200, // Initial — renderer will resize to fit content via overlayResize IPC
    x: display.x + display.width - 344,
    y: display.y + 20,
    useContentSize: true,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    backgroundColor: '#00000000',
    icon: appIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  if (process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/index.html?overlay=1')
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { search: 'overlay=1' })
  }
}

function destroyOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
  overlayWindow = null
}

function applyLoginItem() {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({
      openAtLogin: settings().launchOnStartup,
      args: ['--hidden']
    })
  } catch {
    // Best-effort
  }
}

function refreshTray() {
  refreshMenu({
    onShow: () => createMainWindow(),
    onToggleOverlay: () => {
      const next = !settings().showOverlay
      const data = setSettings({ showOverlay: next })
      if (next) createOverlayWindow()
      else destroyOverlayWindow()
      broadcastData(data)
      refreshTray()
    },
    isOverlayOn: () => settings().showOverlay,
    onQuit: () => {
      ;(app as { isQuiting?: boolean }).isQuiting = true
      app.quit()
    }
  })
}

function quitGracefully() {
  ;(app as { isQuiting?: boolean }).isQuiting = true
  app.quit()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // Deploy script launches `Prodtick.exe --quit` to ask the running copy to
    // exit cleanly before overwriting the install dir.
    if (argv.includes('--quit')) {
      quitGracefully()
      return
    }
    createMainWindow()
  })
}

app.whenReady().then(() => {
  if (process.argv.includes('--quit')) {
    // No prior instance was running (we acquired the lock) — nothing to do.
    quitGracefully()
    return
  }
  if (process.platform === 'win32') app.setAppUserModelId('com.prodtick.app')

  applyLoginItem()

  ensureTray({
    onShow: () => createMainWindow(),
    onToggleOverlay: () => {
      const next = !settings().showOverlay
      const data = setSettings({ showOverlay: next })
      if (next) createOverlayWindow()
      else destroyOverlayWindow()
      broadcastData(data)
      refreshTray()
    },
    isOverlayOn: () => settings().showOverlay,
    onQuit: () => {
      ;(app as { isQuiting?: boolean }).isQuiting = true
      app.quit()
    }
  })
  refreshTray()

  ipcMain.handle(IPC.getData, () => getData())
  ipcMain.handle(IPC.addTask, (_e, html: string) => {
    const d = addTask(html)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.updateTask, (_e, id: TaskId, patch: { html: string }) => {
    const d = updateTask(id, patch.html)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.deleteTask, (_e, id: TaskId) => {
    const d = deleteTask(id)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.tickTask, (_e, id: TaskId) => {
    const d = tickTask(id)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.untickTask, (_e, id: TaskId) => {
    const d = untickTask(id)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.reorderActive, (_e, ids: TaskId[]) => {
    const d = reorderActive(ids)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.archiveCompleted, () => {
    const d = archiveCompleted()
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.archiveOne, (_e, id: TaskId) => {
    const d = archiveOne(id)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.deleteArchived, (_e, id: TaskId) => {
    const d = deleteArchived(id)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.clearArchive, () => {
    const d = clearArchive()
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.restoreArchived, (_e, id: TaskId) => {
    const d = restoreArchived(id)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.setCompletedAt, (_e, id: TaskId, ts: number) => {
    const d = setCompletedAt(id, ts)
    broadcastData(d)
    return d
  })
  const schedulerHooks = {
    onNewReport: (r: WeeklyReport) => {
      broadcastData(getData())
      // Tell the renderer to pop the modal open. The renderer ignores it if
      // the report has been marked seen by the time the message arrives.
      broadcast(IPC.showReport, r.id)
    },
    onToastClick: (id: string) => {
      createMainWindow()
      mainWindow?.show()
      mainWindow?.focus()
      broadcast(IPC.showReport, id)
    },
    iconPath: () => appIconPath()
  }
  startScheduler(schedulerHooks)

  ipcMain.handle(IPC.setWeeklyReportSettings, (_e, patch: Partial<WeeklyReportSettings>) => {
    const d = setWeeklyReportSettings(patch)
    broadcastData(d)
    if (d.settings.weeklyReport.enabled) startScheduler(schedulerHooks)
    else stopScheduler()
    return d
  })
  ipcMain.handle(IPC.generateReportNow, () => {
    generateNow(schedulerHooks)
    return getData()
  })
  ipcMain.handle(IPC.markReportSeen, (_e, id: string) => {
    const d = markReportSeen(id)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.deleteReport, (_e, id: string) => {
    const d = deleteReport(id)
    broadcastData(d)
    return d
  })
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => {
    const launchChanged =
      typeof patch.launchOnStartup === 'boolean' && patch.launchOnStartup !== settings().launchOnStartup
    const overlayChanged =
      typeof patch.showOverlay === 'boolean' && patch.showOverlay !== settings().showOverlay
    const d = setSettings(patch)
    broadcastData(d)
    if (overlayChanged) {
      if (d.settings.showOverlay) createOverlayWindow()
      else destroyOverlayWindow()
    }
    if (launchChanged) applyLoginItem()
    refreshTray()
    return d
  })
  ipcMain.handle(IPC.showMain, () => createMainWindow())
  ipcMain.handle(IPC.isPackaged, () => app.isPackaged)
  ipcMain.handle(IPC.windowMinimize, () => mainWindow?.minimize())
  ipcMain.handle(IPC.windowMaximizeToggle, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle(IPC.windowClose, () => mainWindow?.close())
  ipcMain.handle(IPC.windowIsMaximized, () => mainWindow?.isMaximized() ?? false)
  ipcMain.handle(IPC.overlayHide, () => {
    const d = setSettings({ showOverlay: false })
    destroyOverlayWindow()
    broadcastData(d)
    refreshTray()
  })
  ipcMain.handle(IPC.overlayResize, (_e, height: number) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    const display = screen.getPrimaryDisplay().workArea
    const bounds = overlayWindow.getBounds()
    // Bottom of screen relative to the overlay's current top — never grow off-screen.
    const maxFromY = display.y + display.height - bounds.y - 8
    const target = Math.min(Math.max(120, Math.ceil(height)), maxFromY)
    if (bounds.height === target) return
    overlayWindow.setBounds({ ...bounds, height: target })
  })

  if (!LAUNCH_HIDDEN && !settings().startMinimized) createMainWindow()
  if (settings().showOverlay) createOverlayWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('before-quit', () => {
  ;(app as { isQuiting?: boolean }).isQuiting = true
  stopScheduler()
  destroyTray()
})

app.on('window-all-closed', () => {
  // Keep alive in tray
})
