// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { QuotaNotifications } from './quota-notifications'
import { creditQuota, estimatedForecast, percentageQuota, quotaNow } from '../src/test/quota'
let directory: string
const contexts = { CODEX: 'synthetic-codex-source', KIRO: 'synthetic-kiro-source', ANTIGRAVITY: 'synthetic-ide-source' }
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'meter-notices-')); vi.spyOn(Date, 'now').mockReturnValue(quotaNow) })
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })

// Validates notification opt-in is required and concurrent repeated polls reserve just one persistent receipt.
it('deduplicates polls only after opt-in', async () => {
  const deliver = vi.fn(), notices = new QuotaNotifications(directory, () => true, deliver)
  await notices.initialize(false)
  await notices.observe([percentageQuota()], contexts, () => true)
  expect(deliver).not.toHaveBeenCalled()
  notices.setEnabled(true)
  await Promise.all([notices.observe([percentageQuota()], contexts, () => true), notices.observe([percentageQuota()], contexts, () => true)])
  expect(deliver).toHaveBeenCalledTimes(1)
})
// Validates simultaneous window conditions reserve each identity while producing at most one notification per agent.
it('groups simultaneous warnings by agent', async () => {
  const deliver = vi.fn(), notices = new QuotaNotifications(directory, () => true, deliver)
  await notices.initialize(true)
  const primary = percentageQuota(), secondary = percentageQuota({ name: 'secondary', usedPercent: 100 })
  const rows = [{ ...primary, snapshot: { ...primary.snapshot!, windows: [...primary.snapshot!.windows, ...secondary.snapshot!.windows] } }, creditQuota()]
  await notices.observe(rows, contexts, () => true)
  expect(deliver.mock.calls.map(([alert]) => [alert.provider, alert.kind])).toEqual([['CODEX', 'EXHAUSTED'], ['KIRO', 'NEAR_LIMIT']])
  await notices.observe(rows, contexts, () => true)
  expect(deliver).toHaveBeenCalledTimes(2)
})
// Validates the highest eligible condition is sent once per window, while increasing urgency can deliver a new alert.
it('allows escalation without repeating lower alert levels', async () => {
  const deliver = vi.fn(), notices = new QuotaNotifications(directory, () => true, deliver)
  await notices.initialize(true)
  await notices.observe([percentageQuota()], contexts, () => true)
  await notices.observe([percentageQuota({ usedPercent: 40, forecast: estimatedForecast })], contexts, () => true)
  await notices.observe([percentageQuota({ usedPercent: 90 })], contexts, () => true)
  await notices.observe([percentageQuota({ usedPercent: 100 })], contexts, () => true)
  expect(deliver.mock.calls.map(([alert]) => alert.kind)).toEqual(['NEAR_LIMIT', 'EXHAUSTION_FORECAST', 'EXHAUSTED'])
})
// Validates relaunch restores hashed receipts, source/reset changes rearm delivery, and no source or account data reaches disk.
it('restores deduplication across relaunch with source and cycle isolation', async () => {
  const deliver = vi.fn(), notices = new QuotaNotifications(directory, () => true, deliver)
  await notices.initialize(true)
  await notices.observe([percentageQuota()], contexts, () => true)
  const restored = new QuotaNotifications(directory, () => true, deliver)
  await restored.initialize(true)
  await restored.observe([percentageQuota()], contexts, () => true)
  expect(deliver).toHaveBeenCalledTimes(1)
  await restored.observe([percentageQuota()], { ...contexts, KIRO: 'different-unrelated-source' }, () => true)
  expect(deliver).toHaveBeenCalledTimes(1)
  await restored.observe([percentageQuota()], { CODEX: 'different-source' }, () => true)
  await restored.observe([percentageQuota({ resetAt: new Date(quotaNow + 7200_000).toISOString() })], contexts, () => true)
  expect(deliver).toHaveBeenCalledTimes(3)
  const text = await readFile(join(directory, 'quota-notifications.json'), 'utf8')
  expect(text).not.toMatch(/synthetic|CODEX|plus|observedAt|credits/)
  const value = JSON.parse(text)
  expect(value.receipts).toHaveLength(3)
  expect(value.receipts.every((entry: { key: string }) => /^[a-f0-9]{64}$/.test(entry.key))).toBe(true)
})
// Validates disabled, cancelled, superseded, unsupported and malformed/unscoped evidence never generates OS alerts.
it('rejects inactive requests and invalid live evidence', async () => {
  const deliver = vi.fn(), notices = new QuotaNotifications(directory, () => true, deliver)
  await notices.initialize(true)
  const queued = notices.observe([percentageQuota()], contexts, () => true)
  notices.setEnabled(false)
  await queued
  notices.setEnabled(true)
  await notices.observe([percentageQuota()], contexts, () => false)
  await notices.observe([percentageQuota({ observedAt: new Date(quotaNow - 300_001).toISOString() })], contexts, () => true)
  await notices.observe([{ provider: 'CODEX', status: 'ERROR', snapshot: null }], contexts, () => true)
  await notices.observe([percentageQuota()], contexts, () => true, quotaNow, 'KIRO')
  await notices.observe('INVALID', contexts, () => true)
  const unsupported = new QuotaNotifications(directory, () => false, deliver)
  await unsupported.initialize(true)
  await unsupported.observe([percentageQuota()], contexts, () => true)
  expect(unsupported.state.supported).toBe(false)
  expect(deliver).not.toHaveBeenCalled()
})
// Validates explicit provider failures do not suppress recent healthy credit alerts or convert credits into tokens.
it('alerts on healthy credit sources independently', async () => {
  const deliver = vi.fn(), notices = new QuotaNotifications(directory, () => true, deliver)
  await notices.initialize(true)
  await notices.observe([{ provider: 'CODEX', status: 'ERROR', snapshot: null }, creditQuota()], contexts, () => true)
  expect(deliver).toHaveBeenCalledTimes(1)
  expect(deliver.mock.calls[0][0]).toMatchObject({ provider: 'KIRO', kind: 'NEAR_LIMIT' })
})
// Validates corrupt receipt files remain intact and pause OS notifications without throwing into quota collection.
it('preserves invalid local receipt files', async () => {
  const file = join(directory, 'quota-notifications.json')
  await writeFile(file, 'SYNTHETIC_CORRUPTION')
  const deliver = vi.fn(), notices = new QuotaNotifications(directory, () => true, deliver)
  await notices.initialize(true)
  await notices.observe([percentageQuota()], contexts, () => true)
  expect(notices.state.error).toBe('STORAGE')
  expect(deliver).not.toHaveBeenCalled()
  expect(await readFile(file, 'utf8')).toBe('SYNTHETIC_CORRUPTION')
})
// Validates storage replacement cannot follow a symlink introduced after startup or emit an unreserved notification.
it('fails safely when receipt storage becomes unsafe', async () => {
  const deliver = vi.fn(), notices = new QuotaNotifications(directory, () => true, deliver)
  await notices.initialize(true)
  const target = join(directory, 'unrelated.txt')
  await writeFile(target, 'UNCHANGED')
  await symlink(target, join(directory, 'quota-notifications.json'))
  await notices.observe([percentageQuota()], contexts, () => true)
  expect(notices.state.error).toBe('STORAGE')
  expect(deliver).not.toHaveBeenCalled()
  expect(await readFile(target, 'utf8')).toBe('UNCHANGED')
})
// Validates OS failures pause delivery and the reserved condition does not become an automatic retry loop.
it('isolates system delivery failures', async () => {
  const deliver = vi.fn(() => { throw new Error('SYNTHETIC_OS_FAILURE') })
  const notices = new QuotaNotifications(directory, () => true, deliver)
  await notices.initialize(true)
  await notices.observe([percentageQuota()], contexts, () => true)
  await notices.observe([percentageQuota()], contexts, () => true)
  expect(deliver).toHaveBeenCalledTimes(1)
  expect(notices.state.error).toBe('DELIVERY')
  notices.setEnabled(false); notices.setEnabled(true)
  await notices.observe([percentageQuota()], contexts, () => true)
  expect(deliver).toHaveBeenCalledTimes(1)
})
