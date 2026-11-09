import type { Agent } from '../../usage/model/usage'
export type QuotaWindow = Readonly<{ name: string; usedPercent: number; windowMinutes: number; resetAt: string; observedAt: string; limitId: string | null }>
export type ProviderQuota = Readonly<{ provider: Agent; status: 'OBSERVED' | 'UNAVAILABLE' | 'ERROR'; snapshot: null | { observedAt: string; collectedAt: string; planType: string | null; windows: QuotaWindow[] } }>
export function windowState(window: QuotaWindow, now: number): 'recent' | 'stale' | 'expired' {
  if (Date.parse(window.resetAt) <= now) return 'expired'
  const age = now - Date.parse(window.observedAt)
  return age < -60_000 || age > 5 * 60_000 ? 'stale' : 'recent'
}
