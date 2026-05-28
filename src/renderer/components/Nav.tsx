export type Tab = 'tasks' | 'archive' | 'stats' | 'reports'

interface Props {
  tab: Tab
  onChange: (t: Tab) => void
  archiveCount: number
  reportsCount: number
  reportsFresh: boolean
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'archive', label: 'Archive' },
  { id: 'stats', label: 'Stats' },
  { id: 'reports', label: 'Reports' }
]

export default function Nav({ tab, onChange, archiveCount, reportsCount, reportsFresh }: Props) {
  return (
    <div className="pt-tabs" role="tablist">
      {TABS.map(t => {
        const selected = tab === t.id
        let count: number | null = null
        if (t.id === 'archive' && archiveCount > 0) count = archiveCount
        if (t.id === 'reports' && reportsCount > 0) count = reportsCount
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            className="pt-tab"
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {count !== null && (
              <span
                className="pt-tab-count"
                style={t.id === 'reports' && reportsFresh ? { boxShadow: '0 0 0 2px var(--amber-soft)' } : undefined}
              >
                {String(count).padStart(2, '0')}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
