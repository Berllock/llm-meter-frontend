import { expect, it } from 'vitest'
import { quotaAlerts } from './alerts'
import { creditQuota, estimatedForecast, percentageQuota, quotaNow } from '../../../test/quota'

// Validates the existing 80% threshold, exhausted precedence and provider-reported percentage units.
it('classifies proximity and exhausted percentages', () => {
  expect(quotaAlerts([percentageQuota({ usedPercent: 79.99 })], quotaNow)).toEqual([])
  expect(quotaAlerts([percentageQuota({ usedPercent: 80 })], quotaNow).map(alert => alert.kind)).toEqual(['NEAR_LIMIT'])
  expect(quotaAlerts([percentageQuota({ usedPercent: 100, forecast: estimatedForecast })], quotaNow).map(alert => alert.kind)).toEqual(['EXHAUSTED'])
})
// Validates projections only alert before their future reset and never turn an elapsed prediction into observed exhaustion.
it('requires an actionable future Codex projection', () => {
  const row = percentageQuota({ usedPercent: 40, forecast: estimatedForecast })
  expect(quotaAlerts([row], quotaNow).map(alert => alert.kind)).toEqual(['EXHAUSTION_FORECAST'])
  expect(quotaAlerts([row], quotaNow + 720_001)).toEqual([])
  for (const status of ['RESET_FIRST', 'INSUFFICIENT_DATA', 'STALE'] as const) {
    expect(quotaAlerts([percentageQuota({ usedPercent: 40, forecast: { ...estimatedForecast, status } })], quotaNow)).toEqual([])
  }
  expect(quotaAlerts([{ ...row, provider: 'ANTIGRAVITY' }], quotaNow)).toEqual([])
})
// Validates stale, future-clock, expired and failed sources do not generate new consumption alerts.
it('rejects unverifiable current quota', () => {
  for (const changes of [{ observedAt: new Date(quotaNow - 300_001).toISOString() }, { observedAt: new Date(quotaNow + 60_001).toISOString() },
    { resetAt: new Date(quotaNow).toISOString() }]) expect(quotaAlerts([percentageQuota(changes)], quotaNow)).toEqual([])
  expect(quotaAlerts([{ provider: 'CODEX', status: 'ERROR', snapshot: null }, { provider: 'KIRO', status: 'UNAVAILABLE', snapshot: null }], quotaNow)).toEqual([])
})
// Validates exact credit arithmetic near 80%, zero allowances, overused pools and date-only expiry boundaries.
it('keeps credit pools exact and separate', () => {
  expect(quotaAlerts([creditQuota({ used: '39.999999999999999999', remaining: '10.000000000000000001' })], quotaNow)).toEqual([])
  expect(quotaAlerts([creditQuota({ used: '40', remaining: '10' })], quotaNow)[0].kind).toBe('NEAR_LIMIT')
  expect(quotaAlerts([creditQuota({ used: '51', remaining: '0' })], quotaNow)[0].kind).toBe('EXHAUSTED')
  expect(quotaAlerts([creditQuota({ used: '0', limit: '0', remaining: '0' })], quotaNow)).toEqual([])
  expect(quotaAlerts([creditQuota({ kind: 'BONUS', daysUntilExpiry: 0 })], quotaNow)).toEqual([])
  expect(quotaAlerts([creditQuota({ kind: 'ADD_ON', expiresOn: '2026-11-16' })], quotaNow)).toEqual([])
  const original = creditQuota()
  const renewed = { ...original, snapshot: { ...original.snapshot!, creditQuota: { ...original.snapshot!.creditQuota!, renewalDate: '2026-11-16' } } }
  expect(quotaAlerts([renewed], quotaNow)).toEqual([])
})
// Validates identities ignore poll times while changed reset windows or quota scopes form independent delivery contexts.
it('keeps alert identities tied to reported windows', () => {
  const key = quotaAlerts([percentageQuota()], quotaNow)[0].key
  expect(quotaAlerts([percentageQuota({ observedAt: new Date(quotaNow - 1000).toISOString() })], quotaNow)[0].key).toBe(key)
  expect(quotaAlerts([percentageQuota({ limitId: 'other-model' })], quotaNow)[0].key).not.toBe(key)
  expect(quotaAlerts([percentageQuota({ resetAt: new Date(quotaNow + 7200_000).toISOString() })], quotaNow)[0].key).not.toBe(key)
})
