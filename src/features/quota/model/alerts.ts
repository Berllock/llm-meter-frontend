import type { ProviderQuota, CreditAllowance, CreditQuota } from './quota.js'
import { windowState } from './quota.js'

export type QuotaAlertKind = 'NEAR_LIMIT' | 'EXHAUSTION_FORECAST' | 'EXHAUSTED'
export type QuotaAlert = Readonly<{ key: string; provider: ProviderQuota['provider']; kind: QuotaAlertKind; label: string;
  message: string; observedAt: string; dedupUntil: number }>
export const alertRank: Record<QuotaAlertKind, number> = { NEAR_LIMIT: 1, EXHAUSTION_FORECAST: 2, EXHAUSTED: 3 }
export const creditUnits = (value: string) => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0')) }
export function creditIsRecent(quota: CreditQuota, allowance: CreditAllowance, observedAt: string, now: number) {
  const age = now - Date.parse(observedAt), today = new Date(now).toISOString().slice(0, 10)
  return age >= -60_000 && age <= 300_000 && allowance.daysUntilExpiry !== 0
    && !(allowance.kind === 'SUBSCRIPTION' && quota.renewalDate !== null && quota.renewalDate <= today)
    && !(allowance.expiresOn !== null && allowance.expiresOn <= today)
}

/** Classifies validated live quota only. Historical rows and transport failures are never alert inputs. */
export function quotaAlerts(rows: readonly ProviderQuota[], now: number): QuotaAlert[] {
  const alerts: QuotaAlert[] = []
  for (const row of rows) {
    if (row.status !== 'OBSERVED' || !row.snapshot) continue
    const snapshot = row.snapshot
    if (row.provider === 'KIRO' && snapshot.creditQuota) {
      const quota = snapshot.creditQuota
      quota.allowances.forEach((allowance, index) => {
        if (!creditIsRecent(quota, allowance, snapshot.observedAt, now)) return
        const used = creditUnits(allowance.used), limit = creditUnits(allowance.limit)
        if (limit <= 0n || used * 5n < limit * 4n) return
        const boundary = allowance.kind === 'SUBSCRIPTION' ? quota.renewalDate : allowance.expiresOn
        alerts.push({ provider: row.provider, kind: used >= limit ? 'EXHAUSTED' : 'NEAR_LIMIT',
          key: JSON.stringify([row.provider, quota.planName, allowance.kind, allowance.name, index, allowance.limit, boundary]),
          label: `${row.provider} · ${allowance.name}`,
          message: used >= limit ? 'Reported credit allowance exhausted.' : 'Reported credit usage is close to this limit.',
          observedAt: snapshot.observedAt, dedupUntil: boundary ? Date.parse(boundary) : now + 86_400_000 })
      })
      continue
    }
    for (const window of snapshot.windows) {
      if (windowState(window, now) !== 'recent') continue
      const key = JSON.stringify([row.provider, snapshot.planType, window.limitId, window.name, window.windowMinutes, window.resetAt])
      const base = { key, provider: row.provider, label: `${row.provider} · ${window.displayName ?? window.limitId ?? 'Unspecified scope'} · ${window.name}`,
        observedAt: window.observedAt, dedupUntil: Date.parse(window.resetAt) }
      if (window.usedPercent >= 100) {
        alerts.push({ ...base, kind: 'EXHAUSTED', message: 'Reported allowance exhausted.' })
        continue
      }
      if (window.usedPercent >= 80) alerts.push({ ...base, kind: 'NEAR_LIMIT', message: 'Reported usage is close to this limit.' })
      const forecast = window.forecast
      if (row.provider === 'CODEX' && forecast?.status === 'ESTIMATED' && forecast.projectedExhaustionAt
        && Date.parse(forecast.projectedExhaustionAt) > now && Date.parse(forecast.projectedExhaustionAt) < Date.parse(window.resetAt)) {
        alerts.push({ ...base, kind: 'EXHAUSTION_FORECAST', message: 'At the recorded recent pace, this allowance may run out before its reported reset.' })
      }
    }
  }
  return alerts
}
