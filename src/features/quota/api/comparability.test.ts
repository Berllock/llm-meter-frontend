import { expect, it } from 'vitest'
import { parseQuotaHistory } from './history'
const time = '2026-11-14T12:00:00Z'
const group = { unit: 'PERCENTAGE', index: 0, key: 'b'.repeat(64), reasons: [] }
const entry = { id: 'a'.repeat(64), savedAt: time, accountVerified: true, comparability: { accountStatus: 'RECORDED_ACCOUNT', groups: [group] },
  snapshot: { provider: 'CODEX', observedAt: time, collectedAt: time, planType: 'plus', windows: [
    { name: 'primary', usedPercent: 40, windowMinutes: 300, resetAt: '2026-11-14T16:00:00Z', observedAt: time, limitId: 'codex' },
  ] } }
const envelope = (observation: unknown) => ({ status: 'READY', retentionDays: 30, observations: [observation], failures: [] })

// Validates recorded account evidence and an opaque per-window key can accompany an archived observation without a forecast.
it('accepts identified recorded context and preserves legacy boundaries', () => {
  const value = parseQuotaHistory(envelope(entry)).observations[0]
  expect(value.accountVerified).toBe(true)
  expect(value.comparability?.groups[0].key).toBe(group.key)
  const legacy = { ...entry, accountVerified: false, comparability: { accountStatus: 'LEGACY', groups: [{ ...group, key: null, reasons: ['LEGACY_OBSERVATION'] }] } }
  expect(parseQuotaHistory(envelope(legacy)).observations[0].accountVerified).toBe(false)
})
// Validates flags, window coverage, source support and missing evidence cannot be upgraded into an identified group.
it('rejects contradictory comparison claims', () => {
  for (const invalid of [
    { ...entry, accountVerified: false }, { ...entry, comparability: undefined },
    { ...entry, comparability: { ...entry.comparability, groups: [] } },
    { ...entry, comparability: { ...entry.comparability, groups: [group, group] } },
    { ...entry, comparability: { ...entry.comparability, groups: [{ ...group, index: 1 }] } },
    { ...entry, comparability: { ...entry.comparability, groups: [{ ...group, key: null }] } },
    { ...entry, comparability: { ...entry.comparability, groups: [{ ...group, reasons: ['ACCOUNT_UNVERIFIED'] }] } },
    { ...entry, snapshot: { ...entry.snapshot, planType: null } },
    { ...entry, snapshot: { ...entry.snapshot, provider: 'ANTIGRAVITY', source: 'ANTIGRAVITY_IDE' } },
  ]) expect(() => parseQuotaHistory(envelope(invalid))).toThrow()
})
// Validates Kiro date-only cycles and unknown account/plan evidence stay separate from token-window matching.
it('requires explicit limitations for credit pools', () => {
  const credits = { ...entry, accountVerified: false, snapshot: { provider: 'KIRO', source: 'KIRO_CLI', observedAt: time, collectedAt: time, planType: null, windows: [],
    creditQuota: { planName: 'Synthetic Free', renewalDate: '2026-12-01', overagesEnabled: false,
      allowances: [{ kind: 'SUBSCRIPTION', name: 'Plan credits', used: '10', limit: '50', remaining: '40', expiresOn: null, daysUntilExpiry: null }] } },
    comparability: { accountStatus: 'UNVERIFIED', groups: [{ unit: 'CREDITS', index: 0, key: null, reasons: ['ACCOUNT_UNVERIFIED', 'PLAN_UNVERIFIED', 'RESET_DATE_ONLY'] }] } }
  expect(parseQuotaHistory(envelope(credits)).observations[0].comparability?.groups[0].key).toBeNull()
  expect(() => parseQuotaHistory(envelope({ ...credits, comparability: { ...credits.comparability, groups: [{ ...credits.comparability.groups[0], reasons: ['ACCOUNT_UNVERIFIED'] }] } }))).toThrow()
})
