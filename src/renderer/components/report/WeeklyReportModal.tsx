import { useEffect } from 'react'
import type { WeeklyReport, WeeklyReportSettings } from '@shared/types'
import { prodtick } from '../../api'
import WeekRibbon from './WeekRibbon'
import {
  compareLine,
  completionTag,
  dateline,
  deltaSymbol,
  nextDeliveryHint,
  safeHtml
} from './reportFormat'

interface Props {
  report: WeeklyReport
  settings: WeeklyReportSettings
  onClose: () => void
  onOpenReports: () => void
}

export default function WeeklyReportModal({ report, settings, onClose, onOpenReports }: Props) {
  // Mark seen as soon as the modal renders, so it doesn't re-pop later.
  useEffect(() => {
    if (!report.seen) prodtick.markReportSeen(report.id)
  }, [report.id, report.seen])

  const nudge = report.total === 0
  return (
    <div className="wr-scrim" onClick={onClose}>
      <div className="wr-modal" onClick={e => e.stopPropagation()}>
        <div className="wr-modal-inner">
          <div className="wr-dateline">{dateline(report)}, {new Date(report.weekEnd).getFullYear()}</div>
          <div className="wr-headline">{report.headline}</div>

          <div className="wr-hero">
            <div className={`wr-hero-num${nudge ? ' wr-hero-num-quiet' : ''}`}>{report.total}</div>
            <div className="wr-hero-side">
              <div className="wr-hero-label">ticks</div>
              {nudge ? (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
                  no comparison
                </div>
              ) : (
                <Delta n={report.delta} />
              )}
            </div>
          </div>

          <WeekRibbon days={report.days} peakIndex={report.peakDayIndex} />

          <div className={`wr-pull${nudge ? ' wr-pull-quiet' : ''}`}>
            {!nudge && <span className="wr-pull-dash">—</span>}
            <span className="wr-pull-text">{report.pull}</span>
            {!nudge && <span className="wr-pull-dash">—</span>}
          </div>

          {!nudge && report.completions.length > 0 && (
            <div className="wr-completions">
              <div className="wr-completions-label">A few moments from the week</div>
              <ul className="wr-completions-list">
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
            </div>
          )}

          {!nudge && compareLine(report) && (
            <div className="wr-compare">{compareLine(report)}</div>
          )}
        </div>

        <div className="wr-modal-foot">
          <div className="wr-next-hint">
            {nextDeliveryHint(report.generatedAt, settings.dayOfWeek, settings.hour, settings.minute)}
          </div>
          <div className="wr-foot-btns">
            <button className="pt-btn ghost" onClick={onOpenReports}>
              Open Reports
            </button>
            <button className="pt-btn primary" onClick={onClose}>
              {nudge ? 'Add a task' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Delta({ n }: { n: number }) {
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
        color: up ? 'var(--jade)' : 'var(--rust)',
        letterSpacing: '.02em'
      }}
    >
      {deltaSymbol(n)} <span style={{ color: 'var(--fg-3)' }}>vs prior</span>
    </span>
  )
}
