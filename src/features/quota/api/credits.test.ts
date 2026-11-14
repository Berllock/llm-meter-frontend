import { expect, it } from 'vitest'
import { parseQuota } from './quota'
import { parseCreditQuota } from './credits'

const allowance = { kind: 'SUBSCRIPTION', name: 'Plan credits', used: '12.123456789012345678', limit: '50', remaining: '37.876543210987654322', expiresOn: null, daysUntilExpiry: null }
const credits = { planName: 'Synthetic Free', renewalDate: '2026-12-01', overagesEnabled: false, allowances: [allowance] }
const snapshot = { observedAt: '2026-11-11T12:00:00Z', collectedAt: '2026-11-11T12:00:00Z', planType: null, windows: [], source: 'KIRO_CLI', creditQuota: credits }

// Validates exact decimal balances survive parsing without becoming tokens or synthetic percentage windows.
it('preserves separate Kiro account credits and date-only renewal', () => {
  expect(parseQuota([{ provider: 'KIRO', status: 'OBSERVED', snapshot }], 'KIRO')[0].snapshot?.creditQuota).toEqual(credits)
  expect(parseCreditQuota({ ...credits, renewalDate: null })).toEqual({ ...credits, renewalDate: null })
})
// Validates account credit evidence cannot be attached to a different provider or mixed with token windows.
it('rejects cross-provider or mixed-unit quota', () => {
  for (const provider of ['CODEX', 'ANTIGRAVITY']) expect(() => parseQuota([{ provider, status: 'OBSERVED', snapshot }])).toThrow()
  expect(() => parseQuota([{ provider: 'KIRO', status: 'OBSERVED', snapshot: { ...snapshot, windows: [{}] } }])).toThrow()
})
// Validates precision, arithmetic, duplicate subscription pools, labels and dates before rendering balances.
it('rejects unreliable credit balances', () => {
  for (const invalid of [
    { ...credits, allowances: [{ ...allowance, remaining: '38' }] },
    { ...credits, allowances: [{ ...allowance, used: 12 }] },
    { ...credits, allowances: [{ ...allowance, limit: '-1' }] },
    { ...credits, allowances: [allowance, allowance] },
    { ...credits, allowances: [{ ...allowance, daysUntilExpiry: 2 }] },
    { ...credits, renewalDate: '2026-02-30' },
    { ...credits, planName: 'bad\u0000label' },
  ]) expect(() => parseCreditQuota(invalid)).toThrow()
})
