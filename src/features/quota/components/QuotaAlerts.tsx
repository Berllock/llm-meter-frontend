import { quotaAlerts } from '../model/alerts'
import type { ProviderQuota } from '../model/quota'

export function QuotaAlerts({ rows, current, now }: { rows: readonly ProviderQuota[]; current: boolean; now: number }) {
  const alerts = current ? quotaAlerts(rows, now) : []
  if (!alerts.length) return null
  return <section className="coverage-banner incomplete" aria-label="Quota alerts" aria-live="polite">
    <strong>Quota attention needed</strong>
    <ul>{alerts.map(alert => <li key={`${alert.key}:${alert.kind}`}><strong>{alert.label}</strong> — {alert.message}</li>)}</ul>
    <p>Based on recent reported observations. Provider state and future consumption may differ.</p>
  </section>
}
