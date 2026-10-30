import { collection } from '../test/collection'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useUsage } from '../features/usage/hooks/useUsage'
import { useDesktopBackend } from './useDesktopBackend'
import type { BackendState, DesktopBridge } from '../../shared/desktop-contract'
const period = { from: '2026-10-24', to: '2026-10-26', zone: 'UTC' }
afterEach(() => { delete window.llmMeter })
// Validates queries are gated until Java is ready and changing sources starts a fresh cache.
it('waits for readiness and isolates source generations', async () => {
  const readDailyUsage = vi.fn().mockResolvedValue({ status: 200, body: collection(period) })
  window.llmMeter = { readDailyUsage, cancelUsage: vi.fn() } as unknown as DesktopBridge
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(({ enabled, generation }) => useUsage(period, false, { enabled, generation }), { wrapper, initialProps: { enabled: false, generation: 'first' } })
  expect(readDailyUsage).not.toHaveBeenCalled()
  hook.rerender({ enabled: true, generation: 'first' })
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
  readDailyUsage.mockImplementation(() => new Promise(() => {}))
  hook.rerender({ enabled: true, generation: 'second' })
  await waitFor(() => expect(readDailyUsage).toHaveBeenCalledTimes(2))
  expect(hook.result.current.data).toBeUndefined()
  hook.unmount(); client.clear()
})
// Validates a delayed startup snapshot cannot replace a newer readiness notification.
it('ignores older service snapshots and unsubscribes', async () => {
  let listener: (state: BackendState) => void = () => {}
  let resolve: (state: BackendState) => void = () => {}
  const unsubscribe = vi.fn()
  window.llmMeter = { getBackendState: () => new Promise(done => { resolve = done }), onBackendState: (callback: (state: BackendState) => void) => { listener = callback; return unsubscribe } } as unknown as DesktopBridge
  const hook = renderHook(() => useDesktopBackend())
  act(() => listener({ phase: 'ready', message: 'ready', revision: 2, generation: 'new' }))
  await act(async () => resolve({ phase: 'starting', message: 'starting', revision: 1, generation: 'old' }))
  expect(hook.result.current.state.phase).toBe('ready')
  hook.unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

// Validates desktop polling continues without window focus and still respects the pause control.
it('polls in desktop background and honors pause', async () => {
  vi.useFakeTimers()
  const { focusManager } = await import('@tanstack/react-query')
  focusManager.setFocused(false)
  const readDailyUsage = vi.fn().mockResolvedValue({ status: 200, body: collection(period) })
  window.llmMeter = { readDailyUsage, cancelUsage: vi.fn() } as unknown as DesktopBridge
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(({ autoRefresh }) => useUsage(period, autoRefresh, { enabled: true, generation: 'desktop', refreshInBackground: true }), { wrapper, initialProps: { autoRefresh: true } })
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(readDailyUsage).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(readDailyUsage).toHaveBeenCalledTimes(2)
    hook.rerender({ autoRefresh: false })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(readDailyUsage).toHaveBeenCalledTimes(2)
    hook.rerender({ autoRefresh: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(readDailyUsage).toHaveBeenCalledTimes(3)
  } finally { hook.unmount(); client.clear(); focusManager.setFocused(undefined); vi.useRealTimers() }
})

// Validates browser polling remains paused while the page is in the background.
it('keeps browser polling limited to visible pages', async () => {
  vi.useFakeTimers()
  const { focusManager } = await import('@tanstack/react-query')
  focusManager.setFocused(false)
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(collection(period))))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useUsage(period, true), { wrapper })
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  } finally { hook.unmount(); client.clear(); focusManager.setFocused(undefined); vi.useRealTimers(); fetchMock.mockRestore() }
})
