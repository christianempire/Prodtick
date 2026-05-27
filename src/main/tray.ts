import { app, Tray, Menu, nativeImage } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

let tray: Tray | null = null

function iconsRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons')
    : join(app.getAppPath(), 'resources', 'icons')
}

function buildFallback(): Electron.NativeImage {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const radius = 6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const edge = Math.max(0, Math.min(1, radius - dist))
      const alpha = Math.round(edge * 255)
      const i = (y * size + x) * 4
      buf[i] = 0xff
      buf[i + 1] = 0x78
      buf[i + 2] = 0x52
      buf[i + 3] = alpha
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function loadTrayIcon(): Electron.NativeImage {
  const p = join(iconsRoot(), 'app.ico')
  return existsSync(p) ? nativeImage.createFromPath(p) : buildFallback()
}

export interface TrayCallbacks {
  onShow: () => void
  onToggleOverlay: () => void
  isOverlayOn: () => boolean
  onQuit: () => void
}

export function ensureTray(cb: TrayCallbacks): Tray {
  if (tray) return tray
  tray = new Tray(loadTrayIcon())
  tray.setToolTip('Prodtick')
  refreshMenu(cb)
  tray.on('click', cb.onShow)
  return tray
}

export function refreshMenu(cb: TrayCallbacks) {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: 'Show Prodtick', click: cb.onShow },
    {
      label: cb.isOverlayOn() ? 'Hide desktop overlay' : 'Show desktop overlay',
      click: cb.onToggleOverlay
    },
    { type: 'separator' },
    { label: 'Quit', click: cb.onQuit }
  ])
  tray.setContextMenu(menu)
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}
