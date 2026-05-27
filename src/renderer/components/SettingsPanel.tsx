import { useEffect, useState } from 'react'
import { useTasks } from '../state/tasksStore'
import { prodtick } from '../api'

interface Props {
  onClose: () => void
}

interface Row {
  key: 'launchOnStartup' | 'startMinimized' | 'showOverlay' | 'darkMode'
  title: string
  hint: string
}

export default function SettingsPanel({ onClose }: Props) {
  const settings = useTasks(s => s.data?.settings)
  const [packaged, setPackaged] = useState<boolean | null>(null)

  useEffect(() => {
    prodtick.isPackaged().then(setPackaged)
  }, [])

  if (!settings) return null

  const items: Row[] = [
    {
      key: 'launchOnStartup',
      title: 'Start with Windows',
      hint:
        packaged === false
          ? 'Only works after `npm run deploy`. Launches Prodtick when you sign in.'
          : 'Launches Prodtick when you sign in. Packaged build only.'
    },
    {
      key: 'startMinimized',
      title: 'Start minimized',
      hint: 'Skip the main window and go straight to the tray.'
    },
    {
      key: 'showOverlay',
      title: 'Desktop overlay',
      hint: 'A small always-on-top list pinned to your screen.'
    },
    {
      key: 'darkMode',
      title: 'Dark mode',
      hint: 'Editorial dark is the default. Light is coming.'
    }
  ]

  const toggle = (key: Row['key']) => {
    prodtick.setSettings({ [key]: !settings[key] } as Partial<typeof settings>)
  }

  return (
    <div className="pt-modal-scrim" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-head">Settings</div>
        <div className="pt-modal-body" style={{ paddingTop: 8 }}>
          {items.map(it => (
            <div key={it.key} className="pt-set-row">
              <div>
                <div className="pt-set-title">{it.title}</div>
                <div className="pt-set-hint">{it.hint}</div>
              </div>
              <button
                className={`pt-toggle${settings[it.key] ? ' on' : ''}`}
                onClick={() => toggle(it.key)}
                aria-pressed={settings[it.key]}
                aria-label={it.title}
              />
            </div>
          ))}
        </div>
        <div className="pt-modal-foot">
          <button className="pt-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
