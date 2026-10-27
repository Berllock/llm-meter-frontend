import { describe, expect, it } from 'vitest'
import { addTokens, dailyPoints, summarizeUsage } from './usage'
import type { DailyUsage } from './usage'

const row = (date: string, provider: string, inputTokens: number | null, cachedTokens: number | null = 20): DailyUsage => ({ date, provider, zone: 'UTC', inputTokens, outputTokens: 10, cachedTokens })

describe('usage calculations', () => {
  // Validates that cached input is not added again to input plus output.
  it('preserves metric totals and calculates observed tokens without double counting cache', () => {
    const totals = summarizeUsage([row('2026-10-25', 'CODEX', 100, 80)])
    expect(totals).toEqual({ inputTokens: 100, outputTokens: 10, cachedTokens: 80 })
    expect(addTokens([totals.inputTokens, totals.outputTokens])).toBe(110)
  })
  // Validates that missing records and unknown components do not become zero.
  it('keeps empty and partially unknown totals unavailable', () => {
    expect(summarizeUsage([])).toEqual({ inputTokens: null, outputTokens: null, cachedTokens: null })
    expect(summarizeUsage([row('2026-10-25', 'CODEX', null)])).toEqual({ inputTokens: null, outputTokens: 10, cachedTokens: 20 })
    expect(addTokens([0, 0])).toBe(0)
  })
  // Validates cross-provider grouping, null propagation, ordering, and sparse day semantics.
  it('groups only observed dates and preserves unknown values across providers', () => {
    expect(dailyPoints([row('2026-10-26', 'CODEX', 50), row('2026-10-24', 'CODEX', 100), row('2026-10-24', 'CLAUDE', null)]))
      .toEqual([{ date: '2026-10-24', inputTokens: null, outputTokens: 20, cachedTokens: 40 }, { date: '2026-10-26', inputTokens: 50, outputTokens: 10, cachedTokens: 20 }])
  })
  // Validates that a sum outside JavaScript's exact integer range is never presented as a precise count.
  it('rejects unsafe aggregate precision', () => expect(addTokens([Number.MAX_SAFE_INTEGER, 1])).toBeNull())
})
