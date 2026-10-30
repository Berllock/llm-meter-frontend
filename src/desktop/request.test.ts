import { expect, it, vi } from 'vitest'
import { readDesktopUsage } from './request'
import type { DesktopBridge } from '../../shared/desktop-contract'
const period = { from: '2026-10-24', to: '2026-10-26', zone: 'UTC' }
// Validates cancellation is propagated to the main process when a query is abandoned.
it('cancels an in-flight desktop collection', async () => {
  const bridge = { readDailyUsage: vi.fn(() => new Promise(() => {})), cancelUsage: vi.fn() } as unknown as DesktopBridge
  const controller = new AbortController()
  const pending = readDesktopUsage(bridge, period, controller.signal)
  controller.abort()
  await expect(pending).rejects.toThrow()
  expect(bridge.cancelUsage).toHaveBeenCalledWith(expect.any(String))
})
// Validates the narrow bridge carries the period and response without exposing endpoint credentials.
it('returns the desktop response', async () => {
  const bridge = { readDailyUsage: vi.fn().mockResolvedValue({ status: 200, body: [] }), cancelUsage: vi.fn() } as unknown as DesktopBridge
  expect(await readDesktopUsage(bridge, period)).toEqual({ status: 200, body: [] })
  expect(bridge.readDailyUsage).toHaveBeenCalledWith(period, expect.any(String))
})
