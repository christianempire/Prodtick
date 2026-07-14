# Prodtick — project notes for Claude

Prodtick is an Electron (electron-vite) + React + TypeScript desktop app for Windows.
Main process: `src/main/`, preload: `src/preload/`, renderer: `src/renderer/`, shared: `src/shared/`.

## Launching the app from a Claude Code session (IMPORTANT)

The Claude Code tool environment sets **`ELECTRON_RUN_AS_NODE=1`**. Any Electron process
launched with that variable inherited runs as **plain Node**, so `require('electron').app`
is `undefined` and the main process crashes instantly at startup with:

    TypeError: Cannot read properties of undefined (reading 'isPackaged' / 'commandLine' / ...)

Symptoms: the app "launches" but exits within a few seconds (exit 0 or 1), leaves **0
processes**, shows **no window**, and writes nothing useful to stderr (it's a GUI-subsystem
binary). This is NOT an app bug — it only happens when launched from this environment.

This also affects `npm run deploy`: `scripts/deploy.mjs` ends by spawning the packaged exe,
and that child inherits `ELECTRON_RUN_AS_NODE=1`, so the deployed app dies on launch too.

**To launch the app so it actually runs, clear the variable first.** PowerShell:

    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Start-Process "$env:LOCALAPPDATA\Programs\Prodtick\Prodtick.exe"

Or run `npm run deploy` after clearing it in the same shell. A healthy run shows a **5-process
Electron tree** with exactly one process whose `MainWindowHandle` is non-zero (the visible
window). When launched normally by the user (double-click / Start menu / Windows autostart),
the variable is not set, so the app starts fine — this quirk is specific to Claude sessions.

## Deploy / run

- `npm run deploy` — build + package (`--dir`) + copy to `%LOCALAPPDATA%\Programs\Prodtick` + launch.
  `npm run build` + `npx electron-builder --dir` only write to `release/win-unpacked`, NOT the
  installed copy, so rebuilding without `deploy` does not update the deployed app.
- `npm run dev` — electron-vite dev; pipes the main-process console to the terminal, which is the
  quickest way to see a real main-process startup exception.
