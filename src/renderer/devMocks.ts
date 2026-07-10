import type { ProdtickData, Task } from '@shared/types'

const MOCK_FLAG = 'prodtick:mock'
const DAY = 24 * 60 * 60 * 1000

export function isMockMode(): boolean {
  if (new URLSearchParams(window.location.search).get('mock') === '1') return true
  return localStorage.getItem(MOCK_FLAG) === '1'
}

export function toggleMockMode() {
  const on = !isMockMode()
  if (on) localStorage.setItem(MOCK_FLAG, '1')
  else localStorage.removeItem(MOCK_FLAG)
  location.reload()
}

function makeTask(html: string, completed = false, createdAgoMs = 0, completedAgoMs?: number): Task {
  return {
    id: 'mock-' + Math.random().toString(36).slice(2, 10),
    html,
    createdAt: Date.now() - createdAgoMs,
    completedAt: completed ? Date.now() - (completedAgoMs ?? createdAgoMs / 2) : null
  }
}

export function mockData(): ProdtickData {
  const archive: Task[] = []
  const archiveTitles = [
    'Wrote weekly review',
    'Cleared inbox to zero',
    'Walked 8k steps',
    'Replied to design feedback',
    'Refactored task store',
    'Cooked dinner with M.',
    'Booked dentist',
    'Read 30 pages',
    'Deep work — 2hr block',
    'Watered plants',
    'Called mom',
    'Yoga',
    'Filed expenses',
    'Drafted Q3 OKRs'
  ]
  const daysAgo = [1, 1, 2, 2, 3, 4, 4, 5, 5, 5, 6, 7, 8, 9]
  archiveTitles.forEach((title, i) => {
    archive.push(makeTask(title, true, (daysAgo[i] + 1) * DAY, daysAgo[i] * DAY + 5 * 3600_000))
  })

  return {
    active: [
      makeTask('Finish the <b>Prodtick</b> port from the design mockup', false, 3_600_000),
      makeTask('Read research on <i>flow state</i>', false, 1_800_000),
      makeTask('<span data-color="orange">Urgent:</span> reply to landlord', false, 600_000),
      makeTask('Buy groceries — milk, eggs, <s>kale</s>, bread', false, 300_000),
      makeTask('Plan weekend trip', false, 60_000)
    ],
    done: [
      makeTask('<u>Email</u> recruiter back', true, 7_200_000, 3_600_000),
      makeTask('Fix the <span data-color="blue">build pipeline</span>', true, 14_400_000, 10_800_000)
    ],
    archive,
    reports: [],
    settings: {
      launchOnStartup: false,
      startMinimized: false,
      showOverlay: false,
      darkMode: true,
      weeklyReport: {
        enabled: true,
        dayOfWeek: 1,
        hour: 12,
        minute: 0,
        notify: true
      },
      claudeCode: {
        enabled: true,
        projectAllowlist: []
      }
    }
  }
}
