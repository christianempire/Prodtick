import { useEffect, useState } from 'react'
import { useTasks } from '../state/tasksStore'
import { prodtick } from '../api'
import type { DayOfWeek } from '@shared/types'

interface Props {
  onClose: () => void
}

interface Row {
  key: 'launchOnStartup' | 'startMinimized' | 'showOverlay' | 'darkMode'
  title: string
  hint: string
}

const DAY_LABELS: { value: DayOfWeek; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
]

export default function SettingsPanel({ onClose }: Props) {
  const settings = useTasks(s => s.data?.settings)
  const [packaged, setPackaged] = useState<boolean | null>(null)

  useEffect(() => {
    prodtick.isPackaged().then(setPackaged)
  }, [])

  if (!settings) return null
  const wr = settings.weeklyReport

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

  const hourStr = String(wr.hour).padStart(2, '0')
  const minStr = String(wr.minute).padStart(2, '0')

  return (
    <div className="pt-modal-scrim" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
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

          <div className="wr-set-section">
            <div className="wr-set-rule" />
            <div className="wr-set-title">Weekly report</div>
            <div className="wr-set-sub">A retrospective every week. Quiet by default.</div>
          </div>

          <div className="pt-set-row">
            <div>
              <div className="pt-set-title">Enable weekly report</div>
              <div className="pt-set-hint">
                Generate a look-back over the previous Mon–Sun.
              </div>
            </div>
            <button
              className={`pt-toggle${wr.enabled ? ' on' : ''}`}
              onClick={() => prodtick.setWeeklyReportSettings({ enabled: !wr.enabled })}
              aria-pressed={wr.enabled}
              aria-label="Enable weekly report"
            />
          </div>

          <div className="pt-set-row" style={{ opacity: wr.enabled ? 1 : 0.5 }}>
            <div>
              <div className="pt-set-title">Delivery day</div>
              <div className="pt-set-hint">The day the new report appears in the modal and tray.</div>
            </div>
            <div className="wr-segmented">
              {DAY_LABELS.map(d => (
                <button
                  key={d.value}
                  className={`wr-seg${wr.dayOfWeek === d.value ? ' on' : ''}`}
                  onClick={() => prodtick.setWeeklyReportSettings({ dayOfWeek: d.value })}
                  disabled={!wr.enabled}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-set-row" style={{ opacity: wr.enabled ? 1 : 0.5 }}>
            <div>
              <div className="pt-set-title">Delivery time</div>
              <div className="pt-set-hint">24-hour clock, local time. Defaults to noon.</div>
            </div>
            <div className="wr-time">
              <input
                className="wr-time-input"
                value={hourStr}
                maxLength={2}
                disabled={!wr.enabled}
                onChange={e => {
                  const n = parseInt(e.target.value, 10)
                  if (Number.isFinite(n) && n >= 0 && n <= 23) {
                    prodtick.setWeeklyReportSettings({ hour: n })
                  }
                }}
              />
              <span className="wr-time-colon">:</span>
              <input
                className="wr-time-input"
                value={minStr}
                maxLength={2}
                disabled={!wr.enabled}
                onChange={e => {
                  const n = parseInt(e.target.value, 10)
                  if (Number.isFinite(n) && n >= 0 && n <= 59) {
                    prodtick.setWeeklyReportSettings({ minute: n })
                  }
                }}
              />
            </div>
          </div>

          <div className="pt-set-row" style={{ opacity: wr.enabled ? 1 : 0.5 }}>
            <div>
              <div className="pt-set-title">Show Windows notification</div>
              <div className="pt-set-hint">Post a toast when the report is ready.</div>
            </div>
            <button
              className={`pt-toggle${wr.notify ? ' on' : ''}`}
              onClick={() => prodtick.setWeeklyReportSettings({ notify: !wr.notify })}
              aria-pressed={wr.notify}
              disabled={!wr.enabled}
              aria-label="Show Windows notification"
            />
          </div>

          <div className="pt-set-row" style={{ opacity: wr.enabled ? 1 : 0.5 }}>
            <div>
              <div className="pt-set-title">Generate a report now</div>
              <div className="pt-set-hint">
                Build a report for the most recent complete Mon–Sun, ignoring the schedule.
              </div>
            </div>
            <button
              className="pt-btn"
              disabled={!wr.enabled}
              onClick={async () => {
                await prodtick.generateReportNow()
                onClose()
              }}
            >
              Generate
            </button>
          </div>
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
