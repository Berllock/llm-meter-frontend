export const metrics = ['inputTokens', 'outputTokens', 'cachedTokens'] as const
export type Metric = (typeof metrics)[number]
export type TokenCounts = Readonly<Record<Metric, number | null>>
export type DailyUsage = TokenCounts & Readonly<{ provider: string; date: string; zone: string; credits?: string | null }>
export type UsagePeriod = Readonly<{ from: string; to: string; zone: string }>
export const agents = ['CODEX', 'ANTIGRAVITY', 'KIRO'] as const
export type Agent = (typeof agents)[number]
export type UsageQuery = UsagePeriod & Readonly<{ provider?: Agent }>
export type ModelDailyUsage = DailyUsage & Readonly<{ model: string | null }>
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

export type ProviderCoverage = Readonly<{ provider: string; observedSessions: number; pendingSessions: number; tokenCountsAvailable?: boolean }>
export type DailyUsageCollection = UsagePeriod & Readonly<{
  status: 'COMPLETE' | 'PARTIAL'
  usage: DailyUsage[]
  coverage: ProviderCoverage[]
  modelUsage?: ModelDailyUsage[]
}>

// Credits use decimal strings so aggregation never introduces floating-point token/currency conversions.
export function validCredits(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,17})(\.\d{1,18})?$/.test(value)
}
export function sumCredits(values: readonly (string | null | undefined)[]): string | null {
  if (!values.length || values.some(value => !validCredits(value))) return null
  const scale = 10n ** 18n
  const total = values.reduce<bigint>((sum, value) => {
    const [whole, fraction = ''] = value!.split('.')
    return sum + BigInt(whole) * scale + BigInt(fraction.padEnd(18, '0'))
  }, 0n)
  if (total / scale >= 10n ** 18n) return null
  const fraction = (total % scale).toString().padStart(18, '0').replace(/0+$/, '')
  return (total / scale).toString() + (fraction ? '.' + fraction : '')
}
export function formatCredits(value: string | null): string {
  if (value === null) return '—'
  const [whole, fraction = ''] = value.split('.')
  return new Intl.NumberFormat('en-US').format(BigInt(whole)) + (fraction ? '.' + fraction.slice(0, 3) + (fraction.length > 3 ? '…' : '') : '')
}
