import { readDesktopUsage } from '../../../desktop/request'
import { isDate } from '../model/dates'
import { metrics } from '../model/usage'
import type { DailyUsage, DailyUsageCollection, ProviderCoverage, UsagePeriod } from '../model/usage'

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

export function parseDailyCollection(payload: unknown, period: UsagePeriod): DailyUsageCollection {
  const invalid = () => new UsageApiError('The collected data could not be displayed reliably. Try collecting it again.')
  if (!payload || typeof payload !== 'object') throw invalid()
  const value = payload as Record<string, unknown>
  if (value.from !== period.from || value.to !== period.to || value.zone !== period.zone
    || !['COMPLETE', 'PARTIAL'].includes(value.status as string) || !Array.isArray(value.coverage)) throw invalid()
  const providers = new Map<string, ProviderCoverage>()
  let sessions = 0
  const coverage = value.coverage.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw invalid()
    const item = entry as Record<string, unknown>
    if (typeof item.provider !== 'string' || !item.provider.trim() || providers.has(item.provider)) throw invalid()
    for (const key of ['observedSessions', 'pendingSessions']) {
      if (typeof item[key] !== 'number' || !Number.isSafeInteger(item[key]) || item[key] < 0) throw invalid()
      sessions += item[key]
      if (!Number.isSafeInteger(sessions)) throw invalid()
    }
    const row = { provider: item.provider, observedSessions: item.observedSessions as number, pendingSessions: item.pendingSessions as number }
    providers.set(row.provider, row)
    return row
  })
  if ((value.status === 'PARTIAL') !== coverage.some(item => item.pendingSessions > 0)) throw invalid()
  const usage = parseDailyUsage(value.usage, period)
  if (usage.some(row => !providers.has(row.provider) || providers.get(row.provider)!.observedSessions === 0)) throw invalid()
  return { ...period, status: value.status as DailyUsageCollection['status'], usage, coverage }
}

export async function fetchDailyUsage(period: UsagePeriod, signal?: AbortSignal): Promise<DailyUsageCollection> {
  const params = new URLSearchParams(period)
  try {
    const timeout = AbortSignal.timeout(15_000)
    const response = window.llmMeter ? await readDesktopUsage(window.llmMeter, period, signal) : await fetch(`/api/usage/daily/collection?${params}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { Accept: 'application/json' },
    })
    const status = response.status
    const ok = 'ok' in response ? response.ok : status >= 200 && status < 300
    if (!ok) {
      if (status === 503) throw new UsageApiError('Session data could not be collected safely. No new result is available.', 503)
      if (status === 400) throw new UsageApiError('The selected period or time zone was not accepted. Check the filters and try again.', 400)
      if (status === 0) throw new UsageApiError('Cannot reach the local service. Restart the service and retry.')
      throw new UsageApiError('The local service could not complete this collection. Please try again.', status)
    }
    return parseDailyCollection('json' in response ? await response.json() : response.body, period)
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof UsageApiError) throw error
    if (error instanceof SyntaxError) throw new UsageApiError('The local service returned an unreadable response. Try again.')
    throw new UsageApiError('Cannot reach the local service. Check that LLM Meter’s backend is running, then retry.')
  }
}
