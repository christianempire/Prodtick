export type Tab = 'tasks' | 'archive' | 'stats'

interface Props {
  tab: Tab
  onChange: (t: Tab) => void
  archiveCount: number
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'archive', label: 'Archive' },
  { id: 'stats', label: 'Stats' }
]

export default function Nav({ tab, onChange, archiveCount }: Props) {
  return (
    <div className="pt-tabs" role="tablist">
      {TABS.map(t => {
        const selected = tab === t.id
        const showCount = t.id === 'archive' && archiveCount > 0
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            className="pt-tab"
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {showCount && <span className="pt-tab-count">{archiveCount}</span>}
          </button>
        )
      })}
    </div>
  )
}
