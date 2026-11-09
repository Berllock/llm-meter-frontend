import type { QuotaForecast, QuotaWindow, ForecastStatus } from '../model/quota'

/** Validate optional forecasts independently from transport and never silently accept contradictory projections. */
export function parseForecast(value: unknown, window: QuotaWindow): QuotaForecast | undefined {
  if (value === undefined || value === null) return undefined
  const invalid = () => new Error('Quota forecast could not be displayed reliably.')
  if (!value || typeof value !== 'object') throw invalid()
  const f = value as Record<string, unknown>
  const statuses: ForecastStatus[] = ['INSUFFICIENT_DATA', 'UNVERIFIED_CONTEXT', 'STALE', 'RESET_PASSED', 'EXHAUSTED', 'DISCONTINUOUS', 'NO_GROWTH', 'RESET_FIRST', 'ESTIMATED']
  const date = (item: unknown): item is string | null => item === null || (typeof item === 'string' && Number.isFinite(Date.parse(item)))
  if (!statuses.includes(f.status as ForecastStatus) || typeof f.sampleCount !== 'number' || !Number.isSafeInteger(f.sampleCount)
    || f.sampleCount < 0 || f.sampleCount > 256) throw invalid()
  for (const key of ['sampleFrom', 'sampleTo', 'projectedExhaustionAt', 'earliestExhaustionAt', 'latestExhaustionAt']) if (!date(f[key])) throw invalid()
  if (f.sampleCount === 0 ? f.sampleFrom !== null || f.sampleTo !== null
    : typeof f.sampleFrom !== 'string' || typeof f.sampleTo !== 'string' || Date.parse(f.sampleFrom) > Date.parse(f.sampleTo) || f.sampleTo !== window.observedAt) throw invalid()
  const predicted = f.status === 'ESTIMATED' || f.status === 'RESET_FIRST'
  if (!predicted) {
    if (f.percentagePointsPerHour !== null || f.projectedExhaustionAt !== null || f.earliestExhaustionAt !== null || f.latestExhaustionAt !== null) throw invalid()
  } else {
    if (typeof f.percentagePointsPerHour !== 'number' || !Number.isFinite(f.percentagePointsPerHour) || f.percentagePointsPerHour <= 0
      || f.sampleCount < 3 || typeof f.sampleFrom !== 'string' || typeof f.sampleTo !== 'string' || window.usedPercent >= 100) throw invalid()
    const from = Date.parse(f.sampleFrom), to = Date.parse(f.sampleTo), reset = Date.parse(window.resetAt)
    if (to - from < 120_000 || to - from > 1_800_000 || to >= reset || from < reset - window.windowMinutes * 60_000) throw invalid()
    const projected = to + (100 - window.usedPercent) / f.percentagePointsPerHour * 3600_000
    if (f.status === 'ESTIMATED') {
      if (typeof f.projectedExhaustionAt !== 'string' || typeof f.earliestExhaustionAt !== 'string'
        || Date.parse(f.projectedExhaustionAt) >= reset || Date.parse(f.projectedExhaustionAt) <= to
        || Math.abs(Date.parse(f.projectedExhaustionAt) - projected) > 2_000 || Date.parse(f.earliestExhaustionAt) > Date.parse(f.projectedExhaustionAt)
        || (typeof f.latestExhaustionAt === 'string' && Date.parse(f.latestExhaustionAt) < Date.parse(f.projectedExhaustionAt))) throw invalid()
    } else if (f.projectedExhaustionAt !== null || projected < reset - 1 || f.latestExhaustionAt !== null) throw invalid()
    for (const key of ['earliestExhaustionAt', 'latestExhaustionAt']) {
      if (typeof f[key] === 'string' && (Date.parse(f[key]) <= to || Date.parse(f[key]) >= reset)) throw invalid()
    }
  }
  return { status: f.status as ForecastStatus, sampleCount: f.sampleCount, sampleFrom: f.sampleFrom as string | null,
    sampleTo: f.sampleTo as string | null, percentagePointsPerHour: f.percentagePointsPerHour as number | null,
    projectedExhaustionAt: f.projectedExhaustionAt as string | null, earliestExhaustionAt: f.earliestExhaustionAt as string | null,
    latestExhaustionAt: f.latestExhaustionAt as string | null }
}
