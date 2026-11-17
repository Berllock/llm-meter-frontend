import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { QuotaNotificationToggle } from './QuotaNotificationToggle'
import type { DesktopBridge, QuotaNotificationState } from '../../../../shared/desktop-contract'

// Validates explicit consent uses narrow settings IPC and asynchronous delivery/storage errors stay visible.
it('loads and changes notification consent without restarting the backend', async () => {
  let receive = (_state: QuotaNotificationState) => {}
  const unsubscribe = vi.fn(), restart = vi.fn()
  const set = vi.fn().mockResolvedValue({ enabled: true, supported: true, error: null })
  const bridge = { getQuotaNotifications: vi.fn().mockResolvedValue({ enabled: false, supported: true, error: null }),
    onQuotaNotifications: vi.fn(callback => { receive = callback; return unsubscribe }), setQuotaNotifications: set, restartBackend: restart } as unknown as DesktopBridge
  const view = render(<QuotaNotificationToggle bridge={bridge} />)
  const toggle = screen.getByRole('checkbox', { name: 'Quota desktop notifications' })
  await waitFor(() => expect(toggle).toBeEnabled())
  expect(toggle).not.toBeChecked()
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle).toBeChecked())
  expect(set).toHaveBeenCalledWith(true)
  expect(restart).not.toHaveBeenCalled()
  act(() => receive({ enabled: true, supported: true, error: 'STORAGE' }))
  expect(screen.getByRole('alert')).toHaveTextContent('dashboard alerts remain available')
  view.unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})
// Validates unsupported systems explain availability while allowing existing consent to be disabled.
it('keeps the off switch available on an unsupported system', async () => {
  const bridge = { getQuotaNotifications: vi.fn().mockResolvedValue({ enabled: true, supported: false, error: null }),
    onQuotaNotifications: () => () => {}, setQuotaNotifications: vi.fn().mockResolvedValue({ enabled: false, supported: false, error: null }) } as unknown as DesktopBridge
  render(<QuotaNotificationToggle bridge={bridge} />)
  const toggle = screen.getByRole('checkbox', { name: 'Quota desktop notifications' })
  await waitFor(() => expect(toggle).toBeChecked())
  expect(screen.getByText(/not supported in this environment/)).toBeVisible()
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle).not.toBeChecked())
  expect(toggle).toBeDisabled()
})
// Validates pending consent remains visible during disk writes and rolls back with a safe message after a failed save.
it('keeps pending consent stable and restores the saved value on failure', async () => {
  let reject = (_error: Error) => {}
  const bridge = { getQuotaNotifications: vi.fn().mockResolvedValue({ enabled: false, supported: true, error: null }),
    onQuotaNotifications: () => () => {}, setQuotaNotifications: () => new Promise((_resolve, fail) => { reject = fail }) } as unknown as DesktopBridge
  render(<QuotaNotificationToggle bridge={bridge} />)
  const toggle = screen.getByRole('checkbox', { name: 'Quota desktop notifications' })
  await waitFor(() => expect(toggle).toBeEnabled())
  fireEvent.click(toggle)
  expect(toggle).toBeChecked()
  expect(toggle).toBeDisabled()
  await act(async () => reject(new Error('SYNTHETIC_WRITE_FAILURE')))
  expect(toggle).not.toBeChecked()
  expect(toggle).toBeEnabled()
  expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded or saved')
})
