import { afterEach, expect, it, vi } from 'vitest'
import { parseQuota, fetchQuota } from './quota'
import { windowState } from '../model/quota'
const observedAt = '2026-11-04T12:00:00Z'
const window = { name: 'primary', usedPercent: 85, windowMinutes: 300, resetAt: '2026-11-04T16:00:00Z', observedAt, limitId: 'codex' }
const row = { provider: 'CODEX', status: 'OBSERVED', snapshot: { observedAt, collectedAt: observedAt, planType: 'plus', windows: [window] } }
afterEach(() => vi.unstubAllGlobals())
// Validates percentages and timestamps remain observations, with no guessed absolute token capacity.
it('preserves observed quota and unavailable providers', () => {
  expect(parseQuota([row], 'CODEX')).toEqual([row])
  expect(parseQuota([{ provider: 'KIRO', status: 'UNAVAILABLE', snapshot: null }])).toHaveLength(1)
})
// Validates invalid percentages, duplicate windows, malformed scope and foreign providers are rejected.
it('rejects unsafe quota evidence', () => {
  for (const bad of [{ ...window, usedPercent: 101 }, { ...window, usedPercent: NaN }, { ...window, windowMinutes: 0 }, { ...window, resetAt: 'bad' }, { ...window, limitId: 'private scope' }]) {
    expect(() => parseQuota([{ ...row, snapshot: { ...row.snapshot, windows: [bad] } }])).toThrow()
  }
  expect(() => parseQuota([row, row])).toThrow()
  expect(() => parseQuota([row], 'KIRO')).toThrow()
  expect(() => parseQuota([{ ...row, snapshot: { ...row.snapshot, windows: [window, window] } }])).toThrow()
})
// Validates the five-minute presentation freshness rule and expired resets never become a new zero-used allowance.
it('distinguishes recent, stale, future and expired observations', () => {
  expect(windowState(window, Date.parse(observedAt) + 60_000)).toBe('recent')
  expect(windowState(window, Date.parse(observedAt) + 301_000)).toBe('stale')
  expect(windowState(window, Date.parse(observedAt) - 61_000)).toBe('stale')
  expect(windowState(window, Date.parse(window.resetAt))).toBe('expired')
  expect(window.usedPercent).toBe(85)
})
// Validates provider filtering and cancellation reach the browser transport independently of calendar dates.
it('requests only the selected quota scope', async () => {
  const network = vi.fn().mockResolvedValue(new Response(JSON.stringify([row])))
  vi.stubGlobal('fetch', network)
  await expect(fetchQuota('CODEX')).resolves.toEqual([row])
  expect(network.mock.calls[0][0]).toBe('/api/quota?provider=CODEX')
  expect(network.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
})
// Validates backend failure details are not leaked or presented as a successful empty quota.
it('maps quota collection failure to a safe error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('PRIVATE_CONTENT', { status: 503 })))
  await expect(fetchQuota()).rejects.toThrow('Quota could not be collected. Usage observations remain independent.')
})

// Validates IDE bucket names, unknown duration, query provenance and exclusions without accepting a fabricated forecast.
it('preserves supported Antigravity IDE quota metadata', () => {
  const quota = { ...row, provider: 'ANTIGRAVITY', snapshot: { ...row.snapshot, planType: null, source: 'ANTIGRAVITY_IDE', excludedWindows: 1,
    windows: [{ ...window, name: 'weekly', windowMinutes: null, displayName: 'Synthetic model' }] } }
  const result = parseQuota([quota], 'ANTIGRAVITY')[0].snapshot!
  expect(result.source).toBe('ANTIGRAVITY_IDE')
  expect(result.windows[0].windowMinutes).toBeNull()
  expect(result.excludedWindows).toBe(1)
  expect(() => parseQuota([{ ...quota, provider: 'CODEX' }])).toThrow()
  expect(() => parseQuota([{ ...quota, snapshot: { ...quota.snapshot, windows: [{ ...quota.snapshot.windows[0], forecast: {} }] } }])).toThrow()
})
// Validates nullable duration is restricted to the explicit IDE source and unsafe display labels/exclusion counts fail.
it('rejects contradictory IDE window metadata', () => {
  expect(() => parseQuota([{ ...row, snapshot: { ...row.snapshot, windows: [{ ...window, windowMinutes: null }] } }])).toThrow()
  expect(() => parseQuota([{ ...row, snapshot: { ...row.snapshot, excludedWindows: -1 } }])).toThrow()
  expect(() => parseQuota([{ ...row, snapshot: { ...row.snapshot, windows: [{ ...window, displayName: 'bad\u0000label' }] } }])).toThrow()
})
