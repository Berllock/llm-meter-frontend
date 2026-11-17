import type { CreditAllowance, ProviderQuota, QuotaWindow } from '../features/quota/model/quota'
export const quotaNow = Date.parse('2026-11-16T12:00:00Z')
export function percentageQuota(changes: Partial<QuotaWindow> = {}): ProviderQuota {
  const observedAt = new Date(quotaNow).toISOString()
  return { provider: 'CODEX', status: 'OBSERVED', snapshot: { observedAt, collectedAt: observedAt, planType: 'plus', windows: [
    { name: 'primary', usedPercent: 85, windowMinutes: 300, resetAt: new Date(quotaNow + 3600_000).toISOString(), observedAt, limitId: 'codex', ...changes },
  ] } }
}
export function creditQuota(changes: Partial<CreditAllowance> = {}): ProviderQuota {
  const observedAt = new Date(quotaNow).toISOString()
  return { provider: 'KIRO', status: 'OBSERVED', snapshot: { observedAt, collectedAt: observedAt, planType: null, windows: [], source: 'KIRO_CLI',
    creditQuota: { planName: 'Synthetic Free', renewalDate: '2026-12-01', overagesEnabled: false, allowances: [
      { kind: 'SUBSCRIPTION', name: 'Plan credits', used: '42.5', limit: '50', remaining: '7.5', expiresOn: null, daysUntilExpiry: null, ...changes },
    ] } } }
}
export const estimatedForecast: NonNullable<QuotaWindow['forecast']> = { source: 'SAVED_HISTORY', status: 'ESTIMATED', sampleCount: 3,
  sampleFrom: new Date(quotaNow - 240_000).toISOString(), sampleTo: new Date(quotaNow).toISOString(), percentagePointsPerHour: 300,
  projectedExhaustionAt: new Date(quotaNow + 720_000).toISOString(), earliestExhaustionAt: new Date(quotaNow + 720_000).toISOString(), latestExhaustionAt: null }
