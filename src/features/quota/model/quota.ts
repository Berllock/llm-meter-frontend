import type { Agent } from '../../usage/model/usage'
export type ForecastStatus = 'INSUFFICIENT_DATA' | 'UNVERIFIED_CONTEXT' | 'STALE' | 'RESET_PASSED' | 'EXHAUSTED' | 'DISCONTINUOUS' | 'NO_GROWTH' | 'RESET_FIRST' | 'ESTIMATED'
export type QuotaForecast = Readonly<{ status: ForecastStatus; sampleCount: number; sampleFrom: string | null; sampleTo: string | null;
  percentagePointsPerHour: number | null; projectedExhaustionAt: string | null; earliestExhaustionAt: string | null; latestExhaustionAt: string | null }>
export type QuotaWindow = Readonly<{ name: string; usedPercent: number; windowMinutes: number | null; resetAt: string; observedAt: string; limitId: string | null; forecast?: QuotaForecast; displayName?: string }>
export type ProviderQuota = Readonly<{ provider: Agent; status: 'OBSERVED' | 'UNAVAILABLE' | 'ERROR'; snapshot: null | { observedAt: string; collectedAt: string; planType: string | null; windows: QuotaWindow[]; source?: 'ANTIGRAVITY_IDE'; excludedWindows?: number } }>
export function windowState(window: QuotaWindow, now: number): 'recent' | 'stale' | 'expired' {
  if (Date.parse(window.resetAt) <= now) return 'expired'
  const age = now - Date.parse(window.observedAt)
  return age < -60_000 || age > 5 * 60_000 ? 'stale' : 'recent'
}
