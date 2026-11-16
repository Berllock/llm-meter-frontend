import type { Agent } from '../../usage/model/usage'
export type ForecastStatus = 'INSUFFICIENT_DATA' | 'UNVERIFIED_CONTEXT' | 'STALE' | 'RESET_PASSED' | 'EXHAUSTED' | 'DISCONTINUOUS' | 'NO_GROWTH' | 'RESET_FIRST' | 'ESTIMATED'
export type ForecastSource = 'NATIVE_LOGS' | 'SAVED_HISTORY'
export type QuotaForecast = Readonly<{ status: ForecastStatus; source?: ForecastSource; sampleCount: number; sampleFrom: string | null; sampleTo: string | null;
  percentagePointsPerHour: number | null; projectedExhaustionAt: string | null; earliestExhaustionAt: string | null; latestExhaustionAt: string | null }>
export type QuotaWindow = Readonly<{ name: string; usedPercent: number; windowMinutes: number | null; resetAt: string; observedAt: string; limitId: string | null; forecast?: QuotaForecast; displayName?: string }>
export type CreditAllowance = Readonly<{ kind: 'SUBSCRIPTION' | 'BONUS' | 'ADD_ON'; name: string; used: string; limit: string; remaining: string; expiresOn: string | null; daysUntilExpiry: number | null }>
export type CreditQuota = Readonly<{ planName: string; renewalDate: string | null; overagesEnabled: boolean; allowances: CreditAllowance[] }>
export type ProviderQuota = Readonly<{ provider: Agent; status: 'OBSERVED' | 'UNAVAILABLE' | 'ERROR'; snapshot: null | { observedAt: string; collectedAt: string; planType: string | null; windows: QuotaWindow[]; source?: 'ANTIGRAVITY_IDE' | 'KIRO_CLI'; excludedWindows?: number; creditQuota?: CreditQuota } }>
export function windowState(window: QuotaWindow, now: number): 'recent' | 'stale' | 'expired' {
  if (Date.parse(window.resetAt) <= now) return 'expired'
  const age = now - Date.parse(window.observedAt)
  return age < -60_000 || age > 5 * 60_000 ? 'stale' : 'recent'
}
