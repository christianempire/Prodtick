#!/usr/bin/env node
// Removes the deployed copy at %LOCALAPPDATA%\Programs\Prodtick and clears
// the Windows autostart registry entry. Does NOT touch user data
// (%APPDATA%\Prodtick\) — tasks survive.
//
// Usage:
//   npm run undeploy
//   npm run undeploy -- --wipe-data    # also delete user data

import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import { argv, exit, env } from 'node:process'

if (platform() !== 'win32') {
  console.error('undeploy.mjs currently supports Windows only.')
  exit(1)
}

const flags = new Set(argv.slice(2))
const wipeData = flags.has('--wipe-data')

const localAppData = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
const targetDir = join(localAppData, 'Programs', 'Prodtick')
const appData = env.APPDATA || join(homedir(), 'AppData', 'Roaming')
const userDataDir = join(appData, 'Prodtick')

spawnSync('taskkill', ['/IM', 'Prodtick.exe', '/F'], { stdio: 'ignore' })

if (existsSync(targetDir)) {
  console.log(`› Removing ${targetDir}`)
  rmSync(targetDir, { recursive: true, force: true })
} else {
  console.log(`› ${targetDir} not present, skipping`)
}

console.log('› Removing Windows autostart entry (HKCU Run "Prodtick")')
const psCmd = `Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'Prodtick' -ErrorAction SilentlyContinue`
spawnSync('powershell.exe', ['-NoProfile', '-Command', psCmd], { stdio: 'inherit' })

if (wipeData) {
  if (existsSync(userDataDir)) {
    console.log(`› Wiping user data ${userDataDir}`)
    rmSync(userDataDir, { recursive: true, force: true })
  } else {
    console.log(`› No user data at ${userDataDir}`)
  }
} else {
  console.log(`› Leaving user data at ${userDataDir} (pass --wipe-data to delete)`)
}

console.log('\nDone.')
