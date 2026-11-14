import { afterEach, expect, it, vi } from 'vitest'
import { fetchQuotaHistory, parseQuotaHistory } from './history'

const time = '2026-11-14T12:00:00Z'
const snapshot = { provider: 'CODEX', observedAt: time, collectedAt: time, planType: 'plus', windows: [
  { name: 'primary', usedPercent: 40, windowMinutes: 300, resetAt: '2026-11-14T16:00:00Z', observedAt: time, limitId: 'codex' },
] }
const entry = { id: 'a'.repeat(64), savedAt: time, accountVerified: false, snapshot }
const history = { status: 'READY', retentionDays: 30, observations: [entry], failures: [] }
afterEach(() => vi.unstubAllGlobals())

// Validates saved dates, window cycles and unverified provenance remain historical instead of becoming live quota.
it('parses archived snapshots independently of current quota', () => {
  const parsed = parseQuotaHistory(history, 'CODEX')
  expect(parsed.observations[0].provider).toBe('CODEX')
  expect(parsed.observations[0].snapshot.windows[0].resetAt).toBe('2026-11-14T16:00:00Z')
  expect(parsed.observations[0].accountVerified).toBe(false)
  expect(parseQuotaHistory({ ...history, status: 'PARTIAL', failures: ['KIRO'] }).failures).toEqual(['KIRO'])
  expect(parseQuotaHistory({ ...history, status: 'DISABLED', observations: [] }).status).toBe('DISABLED')
})
// Validates scope, deduplication, safe error status and the absence of persisted predictions before rendering an archive.
it('rejects contradictory or unsafe history', () => {
  for (const value of [
    { ...history, observations: [entry, entry] }, { ...history, observations: [{ ...entry, savedAt: 'invalid' }] },
    { ...history, observations: [{ ...entry, accountVerified: true }] }, { ...history, status: 'DISABLED' },
    { ...history, failures: ['CODEX'] }, { ...history, status: 'PARTIAL' },
    { ...history, status: 'ERROR', failures: ['PRIVATE_DETAIL'] },
    { ...history, observations: [{ ...entry, snapshot: { ...snapshot, windows: [{ ...snapshot.windows[0], forecast: {} }] } }] },
  ]) expect(() => parseQuotaHistory(value)).toThrow()
  expect(() => parseQuotaHistory(history, 'KIRO')).toThrow()
})
// Validates browser history uses the fixed history route and replaces backend diagnostics with a safe message.
it('fetches a scoped archive and sanitizes transport errors', async () => {
  const network = vi.fn().mockResolvedValue(new Response(JSON.stringify(history)))
  vi.stubGlobal('fetch', network)
  await expect(fetchQuotaHistory('CODEX')).resolves.toMatchObject({ status: 'READY' })
  expect(network.mock.calls[0][0]).toBe('/api/quota/history?provider=CODEX')
  network.mockResolvedValue(new Response('PRIVATE_HISTORY_PATH', { status: 503 }))
  await expect(fetchQuotaHistory('CODEX')).rejects.toThrow('Saved quota history is unavailable. Current quota collection remains independent.')
})

// Validates exact archived credit values and date-only renewal are never converted into tokens or currency.
it('preserves archived decimal credits', () => {
  const credits = { ...entry, snapshot: { provider: 'KIRO', source: 'KIRO_CLI', observedAt: time, collectedAt: time, planType: null, windows: [],
    creditQuota: { planName: 'Synthetic Free', renewalDate: '2026-12-01', overagesEnabled: false,
      allowances: [{ kind: 'SUBSCRIPTION', name: 'Plan credits', used: '12.123456789012345678', limit: '50', remaining: '37.876543210987654322', expiresOn: null, daysUntilExpiry: null }] } } }
  expect(parseQuotaHistory({ ...history, observations: [credits] }).observations[0].snapshot.creditQuota?.allowances[0].remaining).toBe('37.876543210987654322')
})
