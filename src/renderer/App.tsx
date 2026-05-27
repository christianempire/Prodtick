import { useEffect } from 'react'
import { useTasks, initTasks } from './state/tasksStore'
import MainView from './components/MainView'
import OverlayView from './components/OverlayView'

interface AppProps {
  isOverlay: boolean
}

export default function App({ isOverlay }: AppProps) {
  const data = useTasks(s => s.data)

  useEffect(() => {
    let off: (() => void) | undefined
    initTasks().then(unsubscribe => {
      off = unsubscribe
    })
    return () => {
      off?.()
    }
  }, [])

  useEffect(() => {
    if (!data) return
    document.documentElement.classList.toggle('dark', data.settings.darkMode)
  }, [data?.settings.darkMode])

  if (!data) {
    return <div className="pt-loading">Loading…</div>
  }
  return isOverlay ? <OverlayView /> : <MainView />
}
