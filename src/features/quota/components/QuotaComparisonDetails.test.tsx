import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { QuotaComparisonDetails } from './QuotaComparisonDetails'
import { contextObservationCounts } from '../model/comparability'
import type { QuotaHistoryEntry } from '../api/history'
const observedAt = '2026-11-14T12:00:00Z'
const key = 'b'.repeat(64)
const entry: QuotaHistoryEntry = { id: 'a'.repeat(64), savedAt: observedAt, accountVerified: true, provider: 'CODEX',
  snapshot: { observedAt, collectedAt: observedAt, planType: 'plus', windows: [{ name: 'primary', usedPercent: 40, windowMinutes: 300,
    resetAt: '2026-11-14T16:00:00Z', observedAt, limitId: 'codex' }] }, comparability: { accountStatus: 'RECORDED_ACCOUNT',
    groups: [{ unit: 'PERCENTAGE', index: 0, key, reasons: [] }] } }

// Validates repeated window timestamps are not manufactured into distinct context samples by changes elsewhere in a snapshot.
it('counts distinct source times within each identified context', () => {
  const repeated = { ...entry, id: 'c'.repeat(64), savedAt: '2026-11-14T12:01:00Z' }
  const later = { ...entry, id: 'd'.repeat(64), snapshot: { ...entry.snapshot, windows: [{ ...entry.snapshot.windows[0], observedAt: '2026-11-14T12:02:00Z' }] } }
  const changed = { ...later, comparability: { ...entry.comparability!, groups: [{ ...entry.comparability!.groups[0], key: 'e'.repeat(64) }] } }
  const counts = contextObservationCounts([entry, repeated, later, changed])
  expect(counts.get(key)).toBe(2)
  expect(counts.get('e'.repeat(64))).toBe(1)
  render(<QuotaComparisonDetails entry={entry} counts={counts} />)
  expect(screen.getByText(/Account identified from recorded session metadata/)).toBeVisible()
  expect(screen.getByText(/Matched context in 2 distinct source timestamps/)).toBeVisible()
  expect(screen.getByText(/forecast still requires recent, consistent samples/)).toBeVisible()
})
// Validates old observations remain explicitly unverified and never inherit identity from a nearby identified record.
it('explains legacy records without promoting their account evidence', () => {
  render(<QuotaComparisonDetails entry={{ ...entry, accountVerified: false, comparability: { accountStatus: 'LEGACY', groups: [
    { unit: 'PERCENTAGE', index: 0, key: null, reasons: ['LEGACY_OBSERVATION'] },
  ] } }} counts={new Map()} />)
  expect(screen.getByText(/Account identity is unverified/)).toBeVisible()
  expect(screen.getByText('This record predates account evidence and cannot be identified retroactively.')).toBeVisible()
  expect(screen.queryByText(/Matched context/)).toBeNull()
})
