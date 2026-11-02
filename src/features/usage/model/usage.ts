export const metrics = ['inputTokens', 'outputTokens', 'cachedTokens'] as const
export type Metric = (typeof metrics)[number]
export type TokenCounts = Readonly<Record<Metric, number | null>>
export type DailyUsage = TokenCounts & Readonly<{ provider: string; date: string; zone: string }>
export type UsagePeriod = Readonly<{ from: string; to: string; zone: string }>
export const agents = ['CODEX', 'ANTIGRAVITY'] as const
export type Agent = (typeof agents)[number]
export type UsageQuery = UsagePeriod & Readonly<{ provider?: Agent }>
export type DailyPoint = TokenCounts & Readonly<{ date: string }>

export const metricLabels: Record<Metric, string> = {
  inputTokens: 'Input tokens', outputTokens: 'Output tokens', cachedTokens: 'Cached input',
}

export function addTokens(values: readonly (number | null)[]): number | null {
  if (!values.length || values.some(value => value === null)) return null
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  return Number.isSafeInteger(total) ? total : null
}

export function summarizeUsage(rows: readonly DailyUsage[]): TokenCounts {
  return Object.fromEntries(metrics.map(metric => [metric, addTokens(rows.map(row => row[metric]))])) as TokenCounts
}

export function dailyPoints(rows: readonly DailyUsage[]): DailyPoint[] {
  const groups = new Map<string, DailyUsage[]>()
  for (const row of rows) groups.set(row.date, [...(groups.get(row.date) ?? []), row])
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...summarizeUsage(values) }))
}

export function formatTokens(value: number | null, compact = false): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('en-US', compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}).format(value)
}

export type ProviderCoverage = Readonly<{ provider: string; observedSessions: number; pendingSessions: number }>
export type DailyUsageCollection = UsagePeriod & Readonly<{
  status: 'COMPLETE' | 'PARTIAL'
  usage: DailyUsage[]
  coverage: ProviderCoverage[]
}>
