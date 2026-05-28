import { Notification, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { addReport, getData } from './dataStore'
import { buildReport, notificationBody, shouldDeliverNow } from './reportEngine'
import type { WeeklyReport } from '@shared/types'

const TICK_MS = 60_000 // Poll every minute — robust to system sleep/wake.

export interface SchedulerHooks {
  onNewReport: (report: WeeklyReport) => void
  onToastClick: (reportId: string) => void
  iconPath: () => string
}

let timer: NodeJS.Timeout | null = null

export function startScheduler(hooks: SchedulerHooks) {
  stopScheduler()
  // Tick once immediately on boot so a missed delivery gets caught up before
  // the first interval fires.
  tick(hooks)
  timer = setInterval(() => tick(hooks), TICK_MS)
}

export function stopScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}

function tick(hooks: SchedulerHooks) {
  const data = getData()
  const ws = data.settings.weeklyReport
  if (!ws.enabled) return
  const check = shouldDeliverNow(Date.now(), ws, data.reports)
  if (!check.deliver) return
  deliver(check.deliveryAt, hooks)
}

// Generates a report for the most recent past delivery instant. Returns the
// new report (or the existing one if nothing changed). Always broadcasts and
// optionally posts a notification.
export function deliver(deliveryAt: number, hooks: SchedulerHooks): WeeklyReport {
  const data = getData()
  const report = buildReport({ data, deliveryAt })
  addReport(report)
  hooks.onNewReport(report)
  if (data.settings.weeklyReport.notify) postNotification(report, hooks)
  return report
}

// Triggered by the user via "Generate now" in settings — always builds a
// report for *right now* regardless of the schedule, and skips the toast
// (the user explicitly asked to see it).
export function generateNow(hooks: SchedulerHooks): WeeklyReport {
  const data = getData()
  const report = buildReport({ data, deliveryAt: Date.now() })
  addReport(report)
  hooks.onNewReport(report)
  return report
}

function postNotification(report: WeeklyReport, hooks: SchedulerHooks) {
  if (!Notification.isSupported()) return
  const iconPath = hooks.iconPath()
  const n = new Notification({
    title: 'Your week in review',
    body: notificationBody(report),
    silent: false,
    icon: existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined
  })
  n.on('click', () => hooks.onToastClick(report.id))
  n.show()
}
