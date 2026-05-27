import { useMemo } from 'react'
import { useTasks } from '../state/tasksStore'
import { compareDayKey, dayKey, lastNDayKeys } from '../lib/time'
import type { Task } from '@shared/types'
import Section from './Section'
import { TrendDownIcon, TrendUpIcon } from './icons'

const DAY = 24 * 60 * 60 * 1000

interface Summary {
  today: number
  thisWeek: number
  lastWeek: number
  allTime: number
  streak: number
}

function computeSummary(
  completions: number[],
  todayKey: string,
  byDay: Map<string, number>
): Summary {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfWeek = startOfToday.getTime() - 6 * DAY
  const startOfPrevWeek = startOfWeek - 7 * DAY

  let today = 0
  let thisWeek = 0
  let lastWeek = 0
  for (const ts of completions) {
    if (ts >= startOfToday.getTime()) today++
    if (ts >= startOfWeek) thisWeek++
    else if (ts >= startOfPrevWeek) lastWeek++
  }

  let streak = 0
  const cursor = new Date(startOfToday)
  while (true) {
    const k = dayKey(cursor.getTime())
    if ((byDay.get(k) ?? 0) > 0) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      if (streak === 0 && k === todayKey) {
        cursor.setDate(cursor.getDate() - 1)
        continue
      }
      break
    }
  }

  return { today, thisWeek, lastWeek, allTime: completions.length, streak }
}

export default function StatsView() {
  const data = useTasks(s => s.data)

  const allDone: Task[] = useMemo(() => {
    if (!data) return []
    return [...data.done, ...data.archive].filter(t => t.completedAt !== null)
  }, [data])

  const completions = useMemo(() => allDone.map(t => t.completedAt as number), [allDone])

  const byDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const ts of completions) m.set(dayKey(ts), (m.get(dayKey(ts)) ?? 0) + 1)
    return m
  }, [completions])

  const days = useMemo(() => lastNDayKeys(14), [])
  const todayKey = dayKey(Date.now())
  const summary = useMemo(
    () => computeSummary(completions, todayKey, byDay),
    [completions, todayKey, byDay]
  )

  const max = Math.max(4, ...days.map(d => byDay.get(d) ?? 0))
  const trend = summary.thisWeek - summary.lastWeek

  return (
    <div className="pt-scroll" style={{ paddingBottom: 22 }}>
      <Section label="Pulse" count={14} />

      <div className="pt-stats-grid">
        <div className="pt-stat today">
          <div className="pt-stat-label">Today</div>
          <div className="pt-stat-value">{summary.today}</div>
        </div>
        <div className="pt-stat">
          <div className="pt-stat-label">Last 7</div>
          <div className="pt-stat-value">{summary.thisWeek}</div>
          {trend !== 0 && (
            <div className={`pt-stat-trend${trend < 0 ? ' down' : ''}`}>
              {trend > 0 ? <TrendUpIcon /> : <TrendDownIcon />} {Math.abs(trend)}
            </div>
          )}
        </div>
        <div className="pt-stat">
          <div className="pt-stat-label">Previous 7</div>
          <div className="pt-stat-value">{summary.lastWeek}</div>
        </div>
        <div className="pt-stat streak">
          <div className="pt-stat-label">Streak</div>
          <div className="pt-stat-value">
            {summary.streak}
            <span className="pt-stat-unit">{summary.streak === 1 ? 'day' : 'days'}</span>
          </div>
        </div>
        <div className="pt-stat wide">
          <div className="pt-stat-label">All time</div>
          <div className="pt-stat-value">
            {summary.allTime}
            <span className="pt-stat-unit">ticks since you started — keep going.</span>
          </div>
        </div>
      </div>

      <div className="pt-chart">
        <div className="pt-chart-head">
          <div className="pt-chart-title">Tasks completed</div>
          <div className="pt-chart-sub">last fourteen days</div>
        </div>
        <div className="pt-chart-area">
          <div className="pt-chart-yaxis">
            <span>{max}</span>
            <span>{Math.round(max / 2)}</span>
            <span>0</span>
          </div>
          <div className="pt-chart-bars">
            {days.map(d => {
              const count = byDay.get(d) ?? 0
              const isToday = compareDayKey(d, todayKey) === 0
              const dayLabel = Number(d.split('-')[2])
              return (
                <div key={d} className={`pt-bar-col${isToday ? ' today' : ''}`}>
                  <div className="pt-bar-count">{count > 0 ? count : ''}</div>
                  <div
                    className={`pt-bar${isToday ? ' today' : ''}${count === 0 ? ' zero' : ''}`}
                    style={{ height: `${Math.max((count / max) * 100, 1)}%` }}
                  />
                  <div className="pt-bar-label">{dayLabel}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
