// Inline SVG icons used across the Editorial Ledger UI.
// Each is `currentColor`-aware so CSS controls the tint.

export const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

export const MinIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

export const MaxIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12">
    <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

export const RestoreIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2" y="3" width="7" height="7" />
    <path d="M3 3V2h7v7H9" />
  </svg>
)

export const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12">
    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

export const ExpandIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M2 5V2h3M10 7v3H7M7 2h3v3M5 10H2V7" />
  </svg>
)

export const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M2 5l2 2 4-5" />
  </svg>
)

export const CrossIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M2 2l6 6M8 2l-6 6" />
  </svg>
)

export const TrendUpIcon = () => (
  <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
    <path d="M5 1l4 7H1z" />
  </svg>
)

export const TrendDownIcon = () => (
  <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
    <path d="M5 9L1 2h8z" />
  </svg>
)

export const ArchiveIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="1.5" y="2" width="9" height="2.5" />
    <path d="M2.5 4.5v5h7v-5" />
    <path d="M5 7h2" strokeLinecap="round" />
  </svg>
)
