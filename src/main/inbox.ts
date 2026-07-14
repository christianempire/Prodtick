import { app } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  watch,
  type FSWatcher
} from 'node:fs'
import { join } from 'node:path'
import { getData, upsertExternalDone } from './dataStore'
import type { ProdtickData, TaskSource } from '@shared/types'

// Drops from finished Claude Code sessions land here as `<sessionId>.json`. The
// hook is a separate process and never touches the store directly — the main
// process is the sole writer, so ingesting through here keeps the in-memory
// cache authoritative and avoids racing external file writes.
//
// Robustness comes from three layers that don't depend on any single fs.watch
// event firing: a drain on startup (catches files dropped while the app was
// closed), an fs.watch on the directory, and a slow safety-net poll.

export interface InboxHooks {
  onIngested: (d: ProdtickData) => void
}

const MAX_HTML = 2000
const DEBOUNCE_MS = 150
const SAFETY_POLL_MS = 45_000
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/

export function inboxDir(): string {
  return join(app.getPath('userData'), 'inbox')
}

let watcher: FSWatcher | null = null
let pollTimer: NodeJS.Timeout | null = null
let drainTimer: NodeJS.Timeout | null = null
let draining = false

export function startInbox(hooks: InboxHooks): void {
  stopInbox()
  const dir = inboxDir()
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // Best-effort — a missing dir just means nothing to drain yet.
  }
  drain(hooks)
  try {
    watcher = watch(dir, { persistent: false }, () => scheduleDrain(hooks))
  } catch {
    // fs.watch can fail (dir removed, platform quirks); the safety poll below
    // still guarantees files get picked up.
  }
  pollTimer = setInterval(() => drain(hooks), SAFETY_POLL_MS)
}

export function stopInbox(): void {
  if (watcher) {
    try {
      watcher.close()
    } catch {
      /* ignore */
    }
    watcher = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (drainTimer) {
    clearTimeout(drainTimer)
    drainTimer = null
  }
}

// fs.watch on Windows fires repeatedly (and sometimes mid-write) for a single
// change; coalesce a burst into one drain shortly after it settles.
function scheduleDrain(hooks: InboxHooks): void {
  if (drainTimer) return
  drainTimer = setTimeout(() => {
    drainTimer = null
    drain(hooks)
  }, DEBOUNCE_MS)
}

// Plain-text → inert HTML. The store renders task.html raw and its DOM-based
// sanitizer can't run here in the main process, so escaping is mandatory. The
// hook writes the title as raw plain text and the file on disk is untrusted, so
// this is the single authoritative escape — do NOT also escape in the hook, or
// the result double-escapes (`"` → `&quot;` → `&amp;quot;`).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br>')
}

interface InboxRecord {
  source: TaskSource
  html: string
  completedAt: number
}

// Returns a validated, re-escaped record, or null when the JSON is missing
// fields or looks like a half-written file (leave those for the next tick).
function parseAndValidate(raw: string): InboxRecord | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const rec = obj as Record<string, unknown>
  const src = rec.source as Record<string, unknown> | undefined
  if (!src || src.kind !== 'claude-code') return null
  const sessionId = src.sessionId
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return null
  const project = typeof src.project === 'string' ? src.project : 'unknown'
  if (typeof rec.html !== 'string' || !rec.html.trim()) return null
  const completedAt =
    typeof rec.completedAt === 'number' && Number.isFinite(rec.completedAt)
      ? rec.completedAt
      : Date.now()
  const source: TaskSource = { kind: 'claude-code', sessionId, project }
  if (typeof src.segmentStart === 'number' && Number.isFinite(src.segmentStart)) {
    source.segmentStart = src.segmentStart
  }
  return {
    source,
    html: escapeHtml(rec.html).slice(0, MAX_HTML),
    completedAt
  }
}

function accept(project: string, allowlist: string[]): boolean {
  return allowlist.length === 0 || allowlist.includes(project)
}

function drain(hooks: InboxHooks): void {
  if (draining) return
  draining = true
  try {
    const dir = inboxDir()
    if (!existsSync(dir)) return
    const settings = getData().settings.claudeCode
    if (!settings.enabled) return

    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const full = join(dir, name)
      let handled = false
      try {
        const rec = parseAndValidate(readFileSync(full, 'utf8'))
        if (rec) {
          if (accept(rec.source.project, settings.projectAllowlist)) {
            const { data } = upsertExternalDone({
              source: rec.source,
              html: rec.html,
              completedAt: rec.completedAt
            })
            hooks.onIngested(data)
          }
          // Valid record (accepted or filtered out) — remove it either way.
          handled = true
        }
        // rec === null: likely a partial write; leave the file for a retry.
      } catch {
        // Transient read error — leave the file for the next tick.
      }
      if (handled) {
        try {
          unlinkSync(full)
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    draining = false
  }
}
