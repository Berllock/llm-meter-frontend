import { isDate } from '../model/dates'
import { metrics } from '../model/usage'
import type { DailyUsage, UsagePeriod } from '../model/usage'

export class UsageApiError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) { super(message); this.name = 'UsageApiError'; this.status = status }
}

export function parseDailyUsage(payload: unknown, period: UsagePeriod): DailyUsage[] {
  const invalid = () => new UsageApiError('The collected data could not be displayed reliably. Try collecting it again.')
  if (!Array.isArray(payload)) throw invalid()
  const identities = new Set<string>()
  return payload.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw invalid()
    const row = value as Record<string, unknown>
    if (typeof row.provider !== 'string' || !row.provider.trim() || typeof row.date !== 'string'
      || !isDate(row.date) || row.date < period.from || row.date > period.to || row.zone !== period.zone) throw invalid()
    for (const metric of metrics) {
      const count = row[metric]
      if (count !== null && (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)) throw invalid()
    }
    const identity = `${row.provider}:${row.date}`
    if (identities.has(identity)) throw invalid()
    identities.add(identity)
    return { provider: row.provider, date: row.date, zone: period.zone,
      inputTokens: row.inputTokens as number | null, outputTokens: row.outputTokens as number | null, cachedTokens: row.cachedTokens as number | null }
  })
}

export async function fetchDailyUsage(period: UsagePeriod, signal?: AbortSignal): Promise<DailyUsage[]> {
  const params = new URLSearchParams(period)
  try {
    const timeout = AbortSignal.timeout(15_000)
    const response = await fetch(`/api/usage/daily?${params}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      if (response.status === 503) throw new UsageApiError('Some session data could not be collected. No partial totals are available.', 503)
      if (response.status === 400) throw new UsageApiError('The selected period or time zone was not accepted. Check the filters and try again.', 400)
      throw new UsageApiError('The local service could not complete this collection. Please try again.', response.status)
    }
    return parseDailyUsage(await response.json(), period)
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof UsageApiError) throw error
    if (error instanceof SyntaxError) throw new UsageApiError('The local service returned an unreadable response. Try again.')
    throw new UsageApiError('Cannot reach the local service. Check that LLM Meter’s backend is running, then retry.')
  }
}
