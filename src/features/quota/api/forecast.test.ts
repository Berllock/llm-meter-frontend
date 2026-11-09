import { expect, it } from 'vitest'
import { parseQuota } from './quota'
const observedAt = '2026-11-09T12:04:00Z'
const window = { name: 'primary', usedPercent: 40, windowMinutes: 300, resetAt: '2026-11-09T16:00:00Z', observedAt, limitId: 'codex' }
const forecast = { status: 'ESTIMATED', sampleCount: 3, sampleFrom: '2026-11-09T12:00:00Z', sampleTo: observedAt, percentagePointsPerHour: 300,
  projectedExhaustionAt: '2026-11-09T12:16:00Z', earliestExhaustionAt: '2026-11-09T12:12:00Z', latestExhaustionAt: null }
const payload = (f: unknown) => [{ provider: 'CODEX', status: 'OBSERVED', snapshot: { observedAt, collectedAt: observedAt, planType: 'plus', windows: [{ ...window, forecast: f }] } }]
// Validates forecasts preserve percentage-point rates, sparse uncertainty bounds and old-server compatibility.
it('preserves a validated forecast and accepts absent forecast evidence', () => {
  expect(parseQuota(payload(forecast))[0].snapshot!.windows[0].forecast).toEqual(forecast)
  expect(parseQuota(payload(undefined))[0].snapshot!.windows[0].forecast).toBeUndefined()
})
// Validates insufficient/stale outcomes cannot carry actionable dates or invented rates.
it('requires non-estimated outcomes to contain no projections', () => {
  const unavailable = { ...forecast, status: 'INSUFFICIENT_DATA', percentagePointsPerHour: null, projectedExhaustionAt: null, earliestExhaustionAt: null }
  expect(parseQuota(payload(unavailable))[0].snapshot!.windows[0].forecast?.status).toBe('INSUFFICIENT_DATA')
  expect(() => parseQuota(payload({ ...unavailable, projectedExhaustionAt: forecast.projectedExhaustionAt }))).toThrow()
})
// Validates impossible rates, times, sample counts, bounds and arithmetic mismatches are rejected.
it.each([
  { percentagePointsPerHour: -1 }, { sampleCount: 2 }, { sampleCount: 257 }, { sampleTo: '2026-11-09T12:03:00Z' },
  { sampleFrom: '2026-11-09T12:03:00Z' }, { projectedExhaustionAt: '2026-11-09T16:00:00Z' },
  { projectedExhaustionAt: '2026-11-09T12:17:00Z' }, { earliestExhaustionAt: '2026-11-09T12:20:00Z' },
  { latestExhaustionAt: '2026-11-09T12:10:00Z' }, { status: 'ASSURED' },
])('rejects contradictory forecast fields: %j', fields => {
  expect(() => parseQuota(payload({ ...forecast, ...fields }))).toThrow()
})
// Validates reset-first scenarios omit a hypothetical post-reset timestamp and cannot contradict the reported pace.
it('validates a reset-first central scenario', () => {
  const slow = { ...forecast, status: 'RESET_FIRST', percentagePointsPerHour: 1, projectedExhaustionAt: null, earliestExhaustionAt: null }
  expect(parseQuota(payload(slow))[0].snapshot!.windows[0].forecast?.status).toBe('RESET_FIRST')
  expect(() => parseQuota(payload({ ...slow, percentagePointsPerHour: 300 }))).toThrow()
})
