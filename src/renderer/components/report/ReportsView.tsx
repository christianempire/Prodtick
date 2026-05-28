import { useState } from 'react'
import type { WeeklyReport } from '@shared/types'
import { useTasks } from '../../state/tasksStore'
import WeekRibbon from './WeekRibbon'
import Sparkline from './Sparkline'
import { compareLine, completionTag, dateline, deltaSymbol, fullDateline, safeHtml } from './reportFormat'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function ReportsView() {
  const reports = useTasks(s => s.data?.reports ?? [])
  const [openId, setOpenId] = useState<string | null>(null)

  const opened = openId ? reports.find(r => r.id === openId) : null

  if (reports.length === 0) {
    return (
      <div className="pt-scroll">
        <div className="wr-masthead">
          <div className="wr-masthead-label">REPORTS · WEEKLY</div>
          <div className="wr-masthead-line">
            <div className="wr-masthead-title">Reports</div>
            <div className="wr-masthead-rule" />
            <div className="wr-masthead-count">00</div>
          </div>
          <div className="wr-masthead-sub">every monday at noon, a look back.</div>
        </div>
        <div className="pt-empty-soft" style={{ padding: '8px 22px 22px' }}>
          No reports yet. The first one will arrive on the next scheduled delivery —
          or generate one now from <em>Settings</em>.
        </div>
      </div>
    )
  }

  if (opened) {
    return <ReportPage report={opened} onBack={() => setOpenId(null)} indexOf={reports.indexOf(opened)} total={reports.length} />
  }

  return (
    <div className="pt-scroll">
      <div className="wr-masthead">
        <div className="wr-masthead-label">REPORTS · WEEKLY</div>
        <div className="wr-masthead-line">
          <div className="wr-masthead-title">Reports</div>
          <div className="wr-masthead-rule" />
          <div className="wr-masthead-count">{String(reports.length).padStart(2, '0')}</div>
        </div>
        <div className="wr-masthead-sub">every monday at noon, a look back.</div>
      </div>

      <div className="wr-index">
        {reports.map((r, i) => {
          const fresh = i === 0 && !r.seen
          return (
            <div
              key={r.id}
              className={`wr-index-row ${fresh ? 'fresh' : ''}`}
              onClick={() => setOpenId(r.id)}
            >
              {fresh && <div className="wr-index-fresh">JUST DELIVERED</div>}
              <div className="wr-index-left">
                <div className="wr-index-dateline">{dateline(r)}</div>
                <div className="wr-index-headline">{r.headline}</div>
              </div>
              <div className="wr-index-mid">
                <Sparkline days={r.days} width={96} height={22} />
              </div>
              <div className="wr-index-right">
                <div className="wr-index-total">{r.total}</div>
                <DeltaChip n={r.delta} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeltaChip({ n }: { n: number }) {
  if (n === 0) {
    return (
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--fg-3)',
          padding: '2px 6px',
          border: '1px solid var(--ink-3)',
          borderRadius: 999
        }}
      >
        ±0
      </span>
    )
  }
  const up = n > 0
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: up ? 'var(--jade)' : 'var(--rust)',
        padding: '2px 6px',
        border: `1px solid ${up ? 'oklch(0.74 0.12 158 / 0.35)' : 'oklch(0.66 0.16 28 / 0.35)'}`,
        background: up ? 'var(--jade-soft)' : 'var(--rust-soft)',
        borderRadius: 999
      }}
    >
      {deltaSymbol(n)}
    </span>
  )
}

interface PageProps {
  report: WeeklyReport
  onBack: () => void
  indexOf: number
  total: number
}

function ReportPage({ report, onBack, indexOf, total }: PageProps) {
  const generated = new Date(report.generatedAt)
  const delivered = generated.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
  const deliveredTime = `${String(generated.getHours()).padStart(2, '0')}:${String(generated.getMinutes()).padStart(2, '0')}`
  const peakName = report.peakDayIndex >= 0 ? DAY_NAMES[report.peakDayIndex] : '—'

  return (
    <div className="pt-scroll">
      <div className="wr-back">
        <button className="wr-back-btn" onClick={onBack}>
          ← All reports
        </button>
        <div className="wr-back-meta">
          <span>
            report {String(indexOf + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}
          </span>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span>
            delivered {delivered}, {deliveredTime}
          </span>
        </div>
      </div>

      <div className="wr-page">
        <div className="wr-page-masthead">
          <div className="wr-page-dateline">{fullDateline(report)}</div>
          <div className="wr-page-headline">{report.headline}</div>
        </div>

        <div className="wr-page-hero">
          <div className="wr-hero-num">{report.total}</div>
          <div className="wr-hero-side wr-hero-side-page">
            <div className="wr-hero-label">ticks</div>
            <PageDelta n={report.delta} />
            <div className="wr-hero-foot">
              {report.peakCount > 0 ? (
                <>
                  peak <i>{peakName}</i> at {report.peakCount} · 4-week avg {report.avg4}
                </>
              ) : (
                <>4-week avg {report.avg4}</>
              )}
            </div>
          </div>
        </div>

        <div className="wr-page-ribbon">
          <WeekRibbon days={report.days} peakIndex={report.peakDayIndex} large />
        </div>

        <div className="wr-pull wr-pull-page">
          {report.total > 0 && <span className="wr-pull-dash">—</span>}
          <span className="wr-pull-text">{report.pull}</span>
          {report.total > 0 && <span className="wr-pull-dash">—</span>}
        </div>

        <div className="wr-page-cols">
          <div className="wr-page-col">
            <div className="wr-section-rule">
              <span>Notable completions</span>
              <span className="wr-section-rule-line" />
            </div>
            {report.completions.length === 0 ? (
              <div className="pt-empty-soft" style={{ padding: 0 }}>
                No ticks logged this week.
              </div>
            ) : (
              <ul className="wr-completions-list wr-completions-page">
                {report.completions.map((c, i) => (
                  <li key={i} className="wr-completion-row">
                    <span className="wr-completion-tag">{completionTag(c.ts)}</span>
                    <span
                      className="wr-completion-title"
                      dangerouslySetInnerHTML={{ __html: safeHtml(c.html) }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="wr-page-col">
            <div className="wr-section-rule">
              <span>By the numbers</span>
              <span className="wr-section-rule-line" />
            </div>
            <dl className="wr-numbers">
              <Row label="Total ticks" value={String(report.total)} />
              <Row label="Prior week" value={String(report.prior)} />
              <Row label="4-week average" value={String(report.avg4)} />
              <Row
                label="Peak day"
                value={
                  report.peakCount > 0 ? (
                    <>
                      <i>{peakName}</i> · {report.peakCount}
                    </>
                  ) : (
                    '—'
                  )
                }
              />
              <Row label="Streak at week's end" value={`${report.streakAtEnd} day${report.streakAtEnd === 1 ? '' : 's'}`} />
              <Row label="Days above zero" value={`${report.days.filter(d => d > 0).length} / 7`} />
            </dl>
          </div>
        </div>

        {compareLine(report) && <div className="wr-compare wr-compare-page">{compareLine(report)}</div>}
      </div>
    </div>
  )
}

function PageDelta({ n }: { n: number }) {
  if (n === 0) {
    return (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>±0</span>
    )
  }
  const up = n > 0
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: up ? 'var(--jade)' : 'var(--rust)'
      }}
    >
      {deltaSymbol(n)} <span style={{ color: 'var(--fg-3)' }}>vs prior</span>
    </span>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="wr-num-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
