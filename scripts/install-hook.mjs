// Non-destructive installer for Prodtick's Claude Code "task done" hook.
//
// Merges a single Stop hook entry into ~/.claude/settings.json WITHOUT touching
// any other top-level keys or hooks belonging to other tools (e.g. psst's own
// Stop hook, which lives in a separate group in the same Stop array). Re-running
// is idempotent: it strips our own previous entry first, then re-adds a fresh
// one, so no duplicates and no stale flags survive.
//
// Usage:
//   node scripts/install-hook.mjs            install / refresh
//   node scripts/install-hook.mjs --uninstall
//   node scripts/install-hook.mjs --status

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const HOOK_SCRIPT = path.join(REPO_ROOT, 'hooks', 'prodtick-done.js')
const INBOX_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'Prodtick', 'inbox')

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')
const SETTINGS_BACKUP = path.join(CLAUDE_DIR, 'settings.json.prodtick.bak')

function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase()
}

function isOurHook(h) {
  return (
    h &&
    typeof h === 'object' &&
    h.command === 'node' &&
    Array.isArray(h.args) &&
    h.args.length > 0 &&
    samePath(h.args[0], HOOK_SCRIPT)
  )
}

function buildEntry() {
  return { type: 'command', command: 'node', args: [HOOK_SCRIPT, '--inbox', INBOX_DIR] }
}

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    if (err && err.code === 'ENOENT') return {}
    // Malformed JSON: surface loudly rather than silently clobbering the file.
    throw new Error(`Could not parse ${SETTINGS_FILE}: ${err.message}`)
  }
}

function writeSettings(settings) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf8')
}

function backup() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) fs.copyFileSync(SETTINGS_FILE, SETTINGS_BACKUP)
  } catch {
    // Best-effort.
  }
}

// Remove our hook objects from an event's group array, pruning emptied groups.
function stripOurs(groups) {
  if (!Array.isArray(groups)) return []
  const out = []
  for (const group of groups) {
    if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) {
      out.push(group)
      continue
    }
    const kept = group.hooks.filter((h) => !isOurHook(h))
    if (kept.length > 0) out.push({ ...group, hooks: kept })
  }
  return out
}

function install() {
  const settings = readSettings()
  backup()
  const hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {}
  hooks.Stop = stripOurs(hooks.Stop)
  hooks.Stop.push({ matcher: '', hooks: [buildEntry()] })
  settings.hooks = hooks
  writeSettings(settings)
  fs.mkdirSync(INBOX_DIR, { recursive: true })
  console.log('Prodtick hook installed.')
  console.log('  script: ' + HOOK_SCRIPT)
  console.log('  inbox:  ' + INBOX_DIR)
  console.log('  claude: ' + SETTINGS_FILE)
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? '  summaries: ON (ANTHROPIC_API_KEY detected)'
      : '  summaries: OFF (set ANTHROPIC_API_KEY for AI titles; falls back to raw text)'
  )
}

function uninstall() {
  const settings = readSettings()
  if (!settings.hooks || typeof settings.hooks !== 'object') {
    console.log('Nothing to remove.')
    return
  }
  backup()
  if (Array.isArray(settings.hooks.Stop)) {
    const cleaned = stripOurs(settings.hooks.Stop)
    if (cleaned.length > 0) settings.hooks.Stop = cleaned
    else delete settings.hooks.Stop
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks
  writeSettings(settings)
  console.log('Prodtick hook removed.')
}

function status() {
  const settings = readSettings()
  const groups = (settings.hooks && settings.hooks.Stop) || []
  const installed =
    Array.isArray(groups) &&
    groups.some((g) => g && Array.isArray(g.hooks) && g.hooks.some(isOurHook))
  console.log(installed ? 'Prodtick hook is INSTALLED.' : 'Prodtick hook is NOT installed.')
  console.log('  script: ' + HOOK_SCRIPT)
  console.log('  inbox:  ' + INBOX_DIR)
}

try {
  if (process.argv.includes('--uninstall')) uninstall()
  else if (process.argv.includes('--status')) status()
  else install()
} catch (err) {
  console.error('Error: ' + (err && err.message ? err.message : String(err)))
  process.exit(1)
}
