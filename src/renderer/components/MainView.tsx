import { useEffect, useState } from 'react'
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
import ReportsView from './report/ReportsView'
import WeeklyReportModal from './report/WeeklyReportModal'

export default function MainView() {
  const data = useTasks(s => s.data)
  const active = data?.active ?? []
  const done = data?.done ?? []
  const archive = data?.archive ?? []
  const reports = data?.reports ?? []
  const weeklyReportSettings = data?.settings.weeklyReport
  const [showSettings, setShowSettings] = useState(false)
  const [tab, setTab] = useState<Tab>('tasks')
  const [modalReportId, setModalReportId] = useState<string | null>(null)

  const tasksEmpty = active.length === 0 && done.length === 0
  const freshReport = reports[0] && !reports[0].seen ? reports[0] : null
  const modalReport = modalReportId ? reports.find(r => r.id === modalReportId) : freshReport

  // Auto-open the modal whenever a new unseen report appears (e.g. fresh
  // delivery, or main-process Generate-now). Until the user dismisses it,
  // re-opens of the window will show it again.
  useEffect(() => {
    if (freshReport && !modalReportId) setModalReportId(freshReport.id)
  }, [freshReport?.id])

  // Listen for explicit "show report" pushes from the main process (toast
  // click, delivery moment).
  useEffect(() => {
    return prodtick.onShowReport(id => setModalReportId(id))
  }, [])

  return (
    <div className="pt-app">
      <TitleBar onOpenSettings={() => setShowSettings(true)} />
      <Nav
        tab={tab}
        onChange={setTab}
        archiveCount={archive.length}
        reportsCount={reports.length}
        reportsFresh={!!freshReport}
      />

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
      {tab === 'reports' && <ReportsView />}

      <FormatToolbar />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {modalReport && weeklyReportSettings && (
        <WeeklyReportModal
          report={modalReport}
          settings={weeklyReportSettings}
          onClose={() => setModalReportId(null)}
          onOpenReports={() => {
            setModalReportId(null)
            setTab('reports')
          }}
        />
      )}
    </div>
  )
}
