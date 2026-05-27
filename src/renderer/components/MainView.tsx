import { useState } from 'react'
import { useTasks } from '../state/tasksStore'
import { prodtick } from '../api'
import TitleBar from './TitleBar'
import TaskRow from './TaskRow'
import SortableList from './SortableList'
import AddTask from './AddTask'
import FormatToolbar from './FormatToolbar'
import SettingsPanel from './SettingsPanel'
import Nav, { Tab } from './Nav'
import ArchiveView from './ArchiveView'
import StatsView from './StatsView'
import Section from './Section'
import EmptyState from './EmptyState'

export default function MainView() {
  const active = useTasks(s => s.data?.active ?? [])
  const done = useTasks(s => s.data?.done ?? [])
  const archive = useTasks(s => s.data?.archive ?? [])
  const [showSettings, setShowSettings] = useState(false)
  const [tab, setTab] = useState<Tab>('tasks')

  const tasksEmpty = active.length === 0 && done.length === 0

  return (
    <div className="pt-app">
      <TitleBar onOpenSettings={() => setShowSettings(true)} />
      <Nav tab={tab} onChange={setTab} archiveCount={archive.length} />

      {tab === 'tasks' && (
        <>
          <div className="pt-scroll">
            <Section label="Active" count={active.length} />
            {tasksEmpty && <EmptyState />}
            <div className="pt-list">
              <AddTask autoFocus={tasksEmpty} />
              <SortableList items={active}>
                {active.map(t => (
                  <TaskRow key={t.id} task={t} variant="active" sortable />
                ))}
              </SortableList>
            </div>

            <Section label="Done" count={done.length} />
            {done.length === 0 ? (
              <div className="pt-empty-soft">Nothing ticked yet.</div>
            ) : (
              <div className="pt-list">
                {done.map(t => (
                  <TaskRow key={t.id} task={t} variant="done" sortable={false} />
                ))}
              </div>
            )}
          </div>

          <div className="pt-footer">
            <button
              className="pt-btn"
              disabled={done.length === 0}
              onClick={() => prodtick.archiveCompleted()}
              title="Move all completed tasks to the archive"
            >
              Archive completed tasks
            </button>
          </div>
        </>
      )}

      {tab === 'archive' && <ArchiveView />}
      {tab === 'stats' && <StatsView />}

      <FormatToolbar />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
