#!/usr/bin/env node
// Builds Prodtick, packages it to a portable win-unpacked directory,
// copies the result to %LOCALAPPDATA%\Programs\Prodtick, optionally
// registers it for Windows autostart, and (optionally) launches it.
//
// Usage:
//   npm run deploy                      # build + (graceful) stop + copy + launch
//   npm run deploy -- --autostart       # also write the HKCU Run entry
//   npm run deploy -- --no-launch       # do not launch the deployed app at the end

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir, platform } from 'node:os'
import { argv, exit, cwd, env } from 'node:process'

if (platform() !== 'win32') {
  console.error('deploy.mjs currently supports Windows only.')
  exit(1)
}

const flags = new Set(argv.slice(2))
const doAutostart = flags.has('--autostart')
const doLaunch = !flags.has('--no-launch')

const localAppData = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
const targetDir = join(localAppData, 'Programs', 'Prodtick')
const exePath = join(targetDir, 'Prodtick.exe')
const projectRoot = cwd()
const buildSource = resolve(projectRoot, 'release', 'win-unpacked')

function run(cmd, args, label) {
  console.log(`\n› ${label}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: projectRoot })
  if (r.status !== 0) {
    console.error(`  ${label} failed (exit ${r.status})`)
    exit(r.status ?? 1)
  }
}

// On Windows without Developer Mode or admin rights, 7za can't create the
// symlinks bundled in winCodeSign-*.7z (the macOS libcrypto/libssl dylibs),
// which makes electron-builder loop forever re-downloading the archive.
// We pre-extract the archive while excluding those two symlink entries
// (harmless — they're macOS-only and unused for a Windows --dir build) and
// park it at the cache name electron-builder expects.
function primeWinCodeSignCache() {
  const cacheDir = join(localAppData, 'electron-builder', 'Cache', 'winCodeSign')
  const expectedName = 'winCodeSign-2.6.0'
  const expectedPath = join(cacheDir, expectedName)
  if (existsSync(join(expectedPath, 'windows-10'))) return

  console.log('\n› Priming winCodeSign cache (workaround for Windows symlink restriction)')

  const sevenZip = resolve(projectRoot, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  if (!existsSync(sevenZip)) {
    console.error(`  7za.exe not found at ${sevenZip}`)
    exit(1)
  }

  mkdirSync(cacheDir, { recursive: true })

  let archive = null
  for (const name of readdirSync(cacheDir)) {
    const p = join(cacheDir, name)
    if (name.toLowerCase().endsWith('.7z') && statSync(p).isFile()) { archive = p; break }
  }
  if (!archive) {
    archive = join(cacheDir, `${expectedName}.7z`)
    const url = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${expectedName}/${expectedName}.7z`
    console.log(`  downloading ${url}`)
    const dl = spawnSync('powershell.exe',
      ['-NoProfile', '-Command',
        `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ` +
        `Invoke-WebRequest -UseBasicParsing -Uri '${url}' -OutFile '${archive}'`],
      { stdio: 'inherit' })
    if (dl.status !== 0) {
      console.error('  Failed to download winCodeSign archive.')
      exit(dl.status ?? 1)
    }
  } else {
    console.log(`  reusing cached archive ${archive}`)
  }

  for (const name of readdirSync(cacheDir)) {
    const p = join(cacheDir, name)
    if (/^\d+$/.test(name) && statSync(p).isDirectory()) {
      rmSync(p, { recursive: true, force: true })
    }
  }

  const stagingDir = join(cacheDir, `${expectedName}.staging`)
  if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true })

  const ex = spawnSync(sevenZip,
    ['x', '-bd', '-y',
      '-xr!libcrypto.dylib',
      '-xr!libssl.dylib',
      archive, `-o${stagingDir}`],
    { stdio: 'inherit' })
  if (ex.status !== 0) {
    console.error(`  7za extraction failed (exit ${ex.status})`)
    exit(ex.status ?? 1)
  }

  if (existsSync(expectedPath)) rmSync(expectedPath, { recursive: true, force: true })
  renameSync(stagingDir, expectedPath)
  console.log(`  primed ${expectedPath}`)
}

console.log('Prodtick deploy → ' + targetDir)

primeWinCodeSignCache()

run('npm', ['run', 'build'], 'Building renderer + main + preload')
run('npx', ['electron-builder', '--dir'], 'Packaging Electron app (--dir)')

if (!existsSync(buildSource)) {
  console.error(`Expected build output at ${buildSource} but it doesn't exist.`)
  exit(1)
}

// Windows locks the .exe of a running process, which would make the rmSync
// below fail partway through and leave a half-wiped install dir. Force-kill
// any running instance first; ignore exit code (taskkill no-ops if nothing
// matches). This is "safe" for Prodtick because every mutation calls
// saveData() synchronously — there is no pending state to flush on shutdown.
console.log('\n› Stopping any running Prodtick instance')
spawnSync('taskkill', ['/IM', 'Prodtick.exe', '/F'], { stdio: 'ignore' })
// Electron apps have a tree of helper processes (GPU, utility, renderer)
// that all share the executable name. The first taskkill races against
// their own shutdown; a follow-up with /T sweeps any survivors.
spawnSync('taskkill', ['/IM', 'Prodtick.exe', '/F', '/T'], { stdio: 'ignore' })
// taskkill returns as soon as the kill is requested, not when Windows
// finishes releasing all the file handles those processes held into the
// install dir. The settle + rmSync retries below cover that gap.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800)

console.log(`\n› Copying to ${targetDir}`)
if (existsSync(targetDir)) {
  // Windows often refuses to delete an install dir whose .exe was running
  // moments ago, even after taskkill — handle release is asynchronous and
  // can be held longer by antivirus scans. But renaming the directory entry
  // almost always succeeds (it's a metadata-only operation). So: move the
  // old install aside, drop the new files in, then best-effort clean up
  // the stash. If the stash can't be removed this run, the next deploy will
  // clear any leftover `.old-*` siblings.
  const stash = `${targetDir}.old-${Date.now()}`
  try {
    renameSync(targetDir, stash)
  } catch {
    // Rename failed — directory itself is locked, not just contents. Fall
    // back to a patient rm with retries.
    rmSync(targetDir, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 })
  }
  // Sweep up any leftover `<targetDir>.old-*` from this or prior deploys.
  const parentDir = join(targetDir, '..')
  const baseName = targetDir.split(/[/\\]/).pop()
  for (const name of readdirSync(parentDir)) {
    if (name.startsWith(`${baseName}.old-`)) {
      try {
        rmSync(join(parentDir, name), { recursive: true, force: true, maxRetries: 20, retryDelay: 200 })
      } catch {
        // Best-effort; a leftover .old-* won't block the deploy.
      }
    }
  }
}
mkdirSync(targetDir, { recursive: true })
cpSync(buildSource, targetDir, { recursive: true })

if (!existsSync(exePath)) {
  console.error(`Prodtick.exe not found at ${exePath} after copy.`)
  exit(1)
}

if (doAutostart) {
  console.log('\n› Registering Windows autostart (HKCU Run)')
  const psCmd = `New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Force | Out-Null; ` +
    `Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'Prodtick' -Value '"${exePath}" --hidden'`
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCmd], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('  Failed to write autostart registry entry.')
    exit(r.status ?? 1)
  }
}

if (doLaunch) {
  console.log('\n› Launching deployed app')
  const child = spawn(exePath, [], { detached: true, stdio: 'ignore' })
  child.unref()
}

console.log('\nDone.')
console.log(`  Installed at:  ${targetDir}`)
console.log(`  Executable:    ${exePath}`)
if (doAutostart) {
  console.log(`  Autostart:     enabled (HKCU Run "Prodtick")`)
} else {
  console.log(`  Autostart:     not changed. Re-run with --autostart, or toggle "Start with Windows" in Settings.`)
}
console.log(`  Launched:      ${doLaunch ? 'yes' : 'no (--no-launch was passed)'}`)
console.log(`\nTo remove: npm run undeploy`)
