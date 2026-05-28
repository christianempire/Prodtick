interface Props {
  days: number[]
  width?: number
  height?: number
}

export default function Sparkline({ days, width = 96, height = 22 }: Props) {
  const max = Math.max(...days, 1)
  const step = width / Math.max(days.length - 1, 1)
  const allZero = days.every(d => d === 0)
  if (allZero) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line
          x1="0"
          y1={height - 2}
          x2={width}
          y2={height - 2}
          stroke="var(--ink-4)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>
    )
  }
  const pts = days.map((n, i) => {
    const x = i * step
    const y = height - 2 - (n / max) * (height - 4)
    return [x, y] as const
  })
  const peakIdx = days.indexOf(max)
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="var(--ink-3)" strokeWidth="1" />
      <path d={d} fill="none" stroke="var(--fg-3)" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === peakIdx ? 2 : 1}
          fill={i === peakIdx ? 'var(--amber)' : 'var(--fg-3)'}
        />
      ))}
    </svg>
  )
}
