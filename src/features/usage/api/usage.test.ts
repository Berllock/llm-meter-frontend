import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDailyUsage, parseDailyUsage, UsageApiError } from './usage'

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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([row])))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchDailyUsage(period, new AbortController().signal)).resolves.toEqual([row])
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/usage/daily?from=2026-10-24&to=2026-10-26&zone=UTC')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })
  // Validates that private backend error details are never forwarded to the UI.
  it('maps service unavailability to a safe message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"PRIVATE_CONTENT"}', { status: 503 })))
    await expect(fetchDailyUsage(period)).rejects.toMatchObject({ status: 503, message: 'Some session data could not be collected. No partial totals are available.' })
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
