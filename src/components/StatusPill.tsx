export type StatusTone = 'good' | 'neutral' | 'signal' | 'warning'

export function StatusPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: StatusTone }) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>
}
