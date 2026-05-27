interface Props {
  label: string
  count: number
  action?: { label: string; onClick: () => void; disabled?: boolean }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export default function Section({ label, count, action }: Props) {
  return (
    <div className="pt-section">
      <div className="pt-section-label">{label}</div>
      <div className="pt-section-rule" />
      <div className="pt-section-count">{pad2(count)}</div>
      {action && (
        <button
          className="pt-section-action"
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
