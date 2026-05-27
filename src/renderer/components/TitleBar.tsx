import { useEffect, useState } from 'react'
import { prodtick } from '../api'
import { GearIcon, MaxIcon, MinIcon, RestoreIcon, XIcon } from './icons'

interface Props {
  onOpenSettings: () => void
}

export default function TitleBar({ onOpenSettings }: Props) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    prodtick.windowIsMaximized().then(setMaximized)
    return prodtick.onMaximized(setMaximized)
  }, [])

  return (
    <div className="pt-title">
      <div className="pt-title-name">Prodtick</div>
      <div className="pt-title-actions">
        <button className="pt-title-btn" onClick={onOpenSettings} title="Settings">
          <GearIcon />
        </button>
        <button className="pt-title-btn" onClick={() => prodtick.windowMinimize()} title="Minimize">
          <MinIcon />
        </button>
        <button
          className="pt-title-btn"
          onClick={() => prodtick.windowMaximizeToggle()}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <RestoreIcon /> : <MaxIcon />}
        </button>
        <button className="pt-title-btn danger" onClick={() => prodtick.windowClose()} title="Close">
          <XIcon />
        </button>
      </div>
    </div>
  )
}
