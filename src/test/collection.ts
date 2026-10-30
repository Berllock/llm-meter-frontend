import type { DailyUsage, DailyUsageCollection, UsagePeriod } from '../features/usage/model/usage'
export function collection(period: UsagePeriod, usage: DailyUsage[] = [], pendingSessions = 0): DailyUsageCollection {
  return { ...period, usage, status: pendingSessions ? 'PARTIAL' : 'COMPLETE',
    coverage: [{ provider: 'CODEX', observedSessions: usage.length ? 1 : 0, pendingSessions }] }
}
