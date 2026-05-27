import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isMockMode, toggleMockMode } from './devMocks'
import './styles.css'

const isOverlay = new URLSearchParams(window.location.search).get('overlay') === '1'
if (isOverlay) document.body.classList.add('overlay')

if (isMockMode()) document.title = 'Prodtick (mock)'

// Ctrl+Shift+M toggles mock mode (Claude Design redesign workflow).
window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
    e.preventDefault()
    toggleMockMode()
  }
})

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <App isOverlay={isOverlay} />
  </React.StrictMode>
)
