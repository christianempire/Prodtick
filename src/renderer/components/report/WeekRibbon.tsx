const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  days: number[] // length 7, Mon..Sun
  peakIndex: number
  large?: boolean
}

export default function WeekRibbon({ days, peakIndex, large = false }: Props) {
  const max = Math.max(...days, 1)
  return (
    <div className="wr-ribbon" style={large ? { gap: 14 } : undefined}>
      {days.map((n, i) => {
        const zero = n === 0
        const peak = i === peakIndex && n > 0
        const h = large ? 84 : 64
        const fill = zero ? 0 : Math.max(8, (n / max) * h)
        return (
          <div
            key={DAYS[i]}
            className={`wr-cell ${peak ? 'peak' : ''} ${zero ? 'zero' : ''}`}
            style={large ? { height: h + 64 } : undefined}
          >
            {peak && <div className="wr-peak-label">peak</div>}
            <div className="wr-bar-wrap" style={{ height: h }}>
              {zero ? (
                <div className="wr-bar-zero" />
              ) : (
                <div className="wr-bar" style={{ height: fill, fontSize: large ? 13 : 11 }}>
                  <span className="wr-bar-n">{n}</span>
                </div>
              )}
            </div>
            <div className="wr-bar-day">{DAYS[i]}</div>
          </div>
        )
      })}
    </div>
  )
}
