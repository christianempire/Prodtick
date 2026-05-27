# Prodtick

A local-first Windows desktop task tracker. Add tasks, tick them off, and watch your week add up. Built in Electron with an "Editorial Ledger" visual theme: warm-dark surfaces, italic serif headings, amber accents.

## Features

- **Add / delete / reorder / tick** tasks with drag-and-drop ordering
- **Rich text** per task — bold, italic, underline, strikethrough, six named colors (red, orange, yellow, jade, blue, violet) via a floating toolbar that appears on text selection
- **Active and Done lists** — tick a task to move it to Done, untick to bring it back
- **Per-row archive** action, plus a "Archive completed tasks" bulk button
- **Archive view** — completed tasks grouped by day, with restore and clear-all
- **Editable completion date** — click "done 2h ago" on any Done or Archived task to backfill a missed entry with the actual time it happened
- **Stats** — today / last 7 / previous 7 / streak / all time, plus a 14-day bar chart
- **Desktop overlay** — always-on-top compact window with quick-add, sortable active list, and a collapsible done section. Auto-grows to fit your tasks (no scrolling)
- **Start with Windows** toggle, system tray icon, single-instance lock

## Tech stack

- [Electron 31](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- React 18 + TypeScript (strict)
- [Zustand](https://github.com/pmndrs/zustand) for renderer state
- [electron-store](https://github.com/sindresorhus/electron-store) for local persistence
- [@dnd-kit](https://dndkit.com/) for drag-and-drop reordering
- Tailwind only as a CSS reset; the UI is hand-authored with `pt-*` classes and CSS variables (see `src/renderer/styles.css`)
- Fonts: Instrument Serif (display), Geist (body), Geist Mono (numerals)

## Project layout

```
src/
├── shared/          # Types + IPC channel names shared between processes
├── main/            # Electron main process: windows, IPC, tray, dataStore
├── preload/         # contextBridge exposing `window.prodtick`
└── renderer/
    ├── components/  # React components (pt-* class system)
    ├── state/       # Zustand store wiring to IPC
    ├── lib/         # format (rich-text sanitize) + time helpers
    ├── App.tsx      # Routes to MainView or OverlayView based on ?overlay=1
    └── styles.css   # Editorial Ledger tokens + component styles
scripts/
├── build-icons.mjs  # Rasterizes resources/icons/{app,app-mini}.svg → app.ico
├── deploy.mjs       # Builds, packages, copies to %LOCALAPPDATA%, launches
└── undeploy.mjs     # Removes the installed copy + Windows autostart entry
resources/icons/     # App SVG masters + generated .ico/.png
```

## Persistence

A single JSON file at `%APPDATA%\Prodtick\prodtick-data.json` storing `{ active, done, archive, settings }`. Every mutation calls `saveData()` synchronously — there is no pending state to flush on shutdown, which is why the deploy script can force-kill the running app without losing anything.

## Development

```sh
npm install
npm run dev          # electron-vite dev mode with hot reload
npm run typecheck    # tsc --noEmit on both main and renderer
npm run build        # bundle main + preload + renderer to out/
```

**Mock mode** — press `Ctrl+Shift+M` in the dev window to load a seeded dataset (sample tasks, two weeks of archived completions). Useful for screenshots and design iteration. Press again to clear.

## Packaging and install

```sh
npm run package                  # electron-builder --dir → release/win-unpacked/
npm run deploy                   # build + force-stop existing + copy to %LOCALAPPDATA% + launch
npm run deploy -- --autostart    # also register HKCU Run entry for Windows startup
npm run deploy -- --no-launch    # do not launch the deployed app after copy
npm run undeploy                 # remove installed copy + autostart entry
npm run undeploy -- --wipe-data  # also delete user data in %APPDATA%\Prodtick
```

The deploy script uses a rename-then-rm trick so an in-use install directory doesn't block updates: it renames the existing install to a `.old-{timestamp}` sibling before dropping the new files into place, then best-effort cleans the stash up on the next run.

## Keyboard shortcuts

- **Enter** inside a task title — commit edits and blur
- **Esc** in the add input — clear the draft
- **Ctrl+Shift+M** — toggle mock mode (dev only)

## Icon

The app icon lives at `resources/icons/app.svg` (master) and `resources/icons/app-mini.svg` (simplified for 16/32 px sizes). Run `npm run build:icons` to regenerate the multi-size `app.ico` after editing either SVG.
