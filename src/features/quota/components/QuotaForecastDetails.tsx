import type { QuotaWindow, ForecastStatus } from '../model/quota'

const unavailable: Partial<Record<ForecastStatus, string>> = {
  INSUFFICIENT_DATA: 'Not enough comparable history. At least 3 distinct observations spanning 2 minutes are required.',
  UNVERIFIED_CONTEXT: 'Account, reported plan or quota scope is not identified in these logs.',
  STALE: 'The last observation is too old or its clock cannot be verified.',
  RESET_PASSED: 'The recorded reset has passed. A new window observation is required.',
  DISCONTINUOUS: 'Counter or observation timing changed; a continuous recent pace cannot be established.',
  NO_GROWTH: 'No increase was recorded in the sampled period. Future consumption cannot be projected.',
  EXHAUSTED: 'The last observation reports this allowance exhausted.',
}
const time = (value: string) => new Date(value).toLocaleString()

export function QuotaForecastDetails({ window, recent, now }: { window: QuotaWindow; recent: boolean; now: number }) {
  const forecast = window.forecast
  if (!recent) return <p className="quota-note">Forecast unavailable: current quota is unverified.</p>
  if (!forecast) return <p className="quota-note">No forecast evidence is available in this response.</p>
  if (forecast.status !== 'ESTIMATED' && forecast.status !== 'RESET_FIRST') return <p className="quota-note">Forecast: {unavailable[forecast.status]}</p>
  if (forecast.projectedExhaustionAt && Date.parse(forecast.projectedExhaustionAt) <= now) return <p className="quota-note">The projection time has passed. A newer observation is needed; exhaustion is not confirmed.</p>
  return <div className="quota-forecast" aria-label={`${window.name} quota forecast`}>
    <strong>Recent-pace scenario</strong>
    <p>{forecast.status === 'RESET_FIRST' ? 'At the recorded average pace, reset arrives before exhaustion.' : `Projected exhaustion: ${time(forecast.projectedExhaustionAt!)}`}</p>
    <p>{forecast.percentagePointsPerHour!.toLocaleString(undefined, { maximumFractionDigits: 2 })} percentage points/hour · {forecast.sampleCount} distinct observations · Sampled {time(forecast.sampleFrom!)} to {time(forecast.sampleTo!)}</p>
    {forecast.earliestExhaustionAt && <p>Fastest observed interval scenario: {time(forecast.earliestExhaustionAt)}.</p>}
    <p>{forecast.latestExhaustionAt ? `Slowest observed interval scenario: ${time(forecast.latestExhaustionAt)}.` : 'At the slowest observed pace, exhaustion is not projected before reset.'}</p>
    <p className="quota-note">Assumes recent consumption continues. Interval scenarios show observed variation, not a statistical confidence interval or a guarantee. The projection uses the reported account plan.</p>
  </div>
}
