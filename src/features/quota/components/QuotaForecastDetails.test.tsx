import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { QuotaForecastDetails } from './QuotaForecastDetails'
import type { QuotaWindow } from '../model/quota'
const window: QuotaWindow = { name: 'primary', usedPercent: 40, windowMinutes: 300, resetAt: '2026-11-09T16:00:00Z', observedAt: '2026-11-09T12:04:00Z', limitId: 'codex',
  forecast: { status: 'ESTIMATED', sampleCount: 3, sampleFrom: '2026-11-09T12:00:00Z', sampleTo: '2026-11-09T12:04:00Z', percentagePointsPerHour: 300,
    projectedExhaustionAt: '2026-11-09T12:16:00Z', earliestExhaustionAt: '2026-11-09T12:12:00Z', latestExhaustionAt: null } }
const now = Date.parse(window.observedAt)
// Validates recent forecasts explain the scenario, sampled evidence, correct unit and lack of statistical confidence.
it('renders the evidence and observed pace variation', () => {
  render(<QuotaForecastDetails window={window} recent now={now} />)
  expect(screen.getByText(/Projected exhaustion:/)).toBeVisible()
  expect(screen.getByText(/300 percentage points\/hour/)).toBeVisible()
  expect(screen.getByText(/not a statistical confidence interval/)).toBeVisible()
})
// Validates retained data from a failed/stale refresh cannot expose an actionable forecast.
it('suppresses projections when current quota is unverified', () => {
  render(<QuotaForecastDetails window={window} recent={false} now={now} />)
  expect(screen.getByText(/Forecast unavailable: current quota is unverified/)).toBeVisible()
  expect(screen.queryByText(/Projected exhaustion:/)).toBeNull()
})
// Validates an elapsed projection never becomes a claim that the provider actually exhausted the allowance.
it('requires a new observation after the projection time passes', () => {
  render(<QuotaForecastDetails window={window} recent now={Date.parse('2026-11-09T12:17:00Z')} />)
  expect(screen.getByText(/exhaustion is not confirmed/)).toBeVisible()
  expect(screen.queryByText(/Projected exhaustion:/)).toBeNull()
})
// Validates insufficient comparable samples have an explicit explanation instead of a made-up date.
it('explains insufficient history', () => {
  const sparse = { ...window, forecast: { ...window.forecast!, status: 'INSUFFICIENT_DATA' as const, percentagePointsPerHour: null, projectedExhaustionAt: null, earliestExhaustionAt: null } }
  render(<QuotaForecastDetails window={sparse} recent now={now} />)
  expect(screen.getByText(/At least 3 distinct observations/)).toBeVisible()
})
