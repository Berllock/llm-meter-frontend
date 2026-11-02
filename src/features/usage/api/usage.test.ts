import { collection } from '../../../test/collection'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDailyUsage, parseDailyUsage, parseDailyCollection, UsageApiError } from './usage'

const period = { from: '2026-10-24', to: '2026-10-26', zone: 'UTC' }
const row = { provider: 'CODEX', date: '2026-10-25', zone: 'UTC', inputTokens: 100, outputTokens: 10, cachedTokens: null }
afterEach(() => vi.unstubAllGlobals())

describe('usage API contract', () => {
  // Validates nullable counters and successful sparse empty responses.
  it('preserves nulls and empty observations', () => {
    expect(parseDailyUsage([row], period)).toEqual([row])
    expect(parseDailyUsage([], period)).toEqual([])
  })
  // Validates rejection of precision loss, invalid counts, missing fields, duplicate observations, and mismatched query scope.
  it.each([
    [{ ...row, inputTokens: -1 }], [{ ...row, inputTokens: 1.5 }], [{ ...row, inputTokens: Number.MAX_SAFE_INTEGER + 1 }],
    [{ ...row, inputTokens: undefined }], [{ ...row, zone: 'America/Sao_Paulo' }], [{ ...row, date: '2026-10-27' }],
    [row, row], { rows: [row] },
  ].map(payload => ({ payload })))('rejects an invalid response instead of inventing usable values: %j', ({ payload }) => {
    expect(() => parseDailyUsage(payload, period)).toThrow(UsageApiError)
  })
  // Validates filter encoding and cancellation propagation to the network request.
  it('sends the period and an abortable same-origin request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(collection(period, [row]))))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchDailyUsage(period, new AbortController().signal)).resolves.toEqual(collection(period, [row]))
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/usage/daily/collection?from=2026-10-24&to=2026-10-26&zone=UTC')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })
  // Validates that private backend error details are never forwarded to the UI.
  it('maps service unavailability to a safe message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"PRIVATE_CONTENT"}', { status: 503 })))
    await expect(fetchDailyUsage(period)).rejects.toMatchObject({ status: 503, message: 'Session data could not be collected safely. No new result is available.' })
  })
  // Validates that an aborted request stays cancelled rather than becoming a connection error.
  it('preserves query cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = new DOMException('Cancelled', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
    await expect(fetchDailyUsage(period, controller.signal)).rejects.toBe(error)
  })
})

// Validates partial and entirely pending envelopes preserve source coverage without inventing rows.
it('preserves partial coverage and pending-only collections', () => {
  expect(parseDailyCollection(collection(period, [row], 3), period)).toEqual(collection(period, [row], 3))
  const empty = parseDailyCollection(collection(period, [], 3), period)
  expect(empty.status).toBe('PARTIAL')
  expect(empty.usage).toEqual([])
})
// Validates contradictory, imprecise, duplicate, missing, and mismatched coverage cannot masquerade as a trustworthy collection.
it.each([
  { ...collection(period, [row], 1), status: 'COMPLETE' },
  { ...collection(period, [row]), status: 'PARTIAL' },
  { ...collection(period, [row]), from: '2026-01-01' },
  { ...collection(period, [row]), coverage: [] },
  { ...collection(period, [row]), coverage: [{ provider: 'CODEX', observedSessions: 0, pendingSessions: 0 }] },
  { ...collection(period), coverage: [{ provider: 'CODEX', observedSessions: 1, pendingSessions: -1 }] },
  { ...collection(period), coverage: [{ provider: 'CODEX', observedSessions: 1.5, pendingSessions: 0 }] },
  { ...collection(period), coverage: [{ provider: 'CODEX', observedSessions: Number.MAX_SAFE_INTEGER, pendingSessions: 1 }] },
  { ...collection(period), coverage: [...collection(period).coverage, ...collection(period).coverage] },
  { ...collection(period), usage: undefined },
].map(payload => ({ payload })))('rejects invalid collection metadata: %j', ({ payload }) => {
  expect(() => parseDailyCollection(payload, period)).toThrow(UsageApiError)
})

// Validates a selected agent reaches the backend and a response from another agent is refused.
it('encodes and validates agent selection', async () => {
  const query = { ...period, provider: 'CODEX' as const }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(collection(period, [row]))))
  vi.stubGlobal('fetch', fetchMock)
  await fetchDailyUsage(query)
  expect(fetchMock.mock.calls[0][0]).toContain('&provider=CODEX')
  const foreign = { ...collection(period, [{ ...row, provider: 'ANTIGRAVITY' }]), coverage: [{ provider: 'ANTIGRAVITY', observedSessions: 1, pendingSessions: 0 }] }
  expect(() => parseDailyCollection(foreign, query)).toThrow(UsageApiError)
})
