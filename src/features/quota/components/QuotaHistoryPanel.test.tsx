import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { QuotaHistoryPanel } from './QuotaHistoryPanel'
import type { QuotaHistory } from '../api/history'
const history: QuotaHistory = { status: 'READY', retentionDays: 30, failures: [], observations: [{ id: 'a'.repeat(64), savedAt: '2026-11-14T12:01:00Z', accountVerified: false, provider: 'CODEX',
  snapshot: { observedAt: '2026-11-14T12:00:00Z', collectedAt: '2026-11-14T12:01:00Z', planType: 'plus', windows: [
    { name: 'primary', usedPercent: 40, windowMinutes: 300, resetAt: '2026-11-14T16:00:00Z', observedAt: '2026-11-14T12:00:00Z', limitId: 'codex' },
  ] } }] }
function show(data: QuotaHistory) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['quota-history', 'synthetic', 'ALL'], data)
  return render(<QueryClientProvider client={client}><QuotaHistoryPanel autoRefresh={false} runtime={{ enabled: true, generation: 'synthetic', refreshInBackground: false }} /></QueryClientProvider>)
}
async function expand(details: HTMLDetailsElement) {
  await act(async () => { details.open = true; fireEvent(details, new Event('toggle', { bubbles: false })) })
}
// Validates archived values require explicit expansion and are labeled historical, unverified and independent of forecasts.
it('shows saved observations with distinct save and source times', async () => {
  show(history)
  const panel = screen.getByRole('region', { name: 'Saved quota history' })
  expect(within(panel).queryByText(/First saved/)).toBeNull()
  await expand(panel.querySelector('details')!)
  expect(panel).toHaveTextContent('not a current balance')
  expect(panel).toHaveTextContent('Account and cycle evidence are checked per observation')
  const entry = panel.querySelector('ol details')!
  await expand(entry as HTMLDetailsElement)
  expect(panel).toHaveTextContent('40% used at observation')
  expect(panel).toHaveTextContent('First saved')
  expect(panel).not.toHaveTextContent('Projected exhaustion')
})
// Validates storage failure does not masquerade as a successful empty archive and leaves current quota independent.
it('shows a safe per-provider storage error', async () => {
  show({ ...history, status: 'ERROR', observations: [], failures: ['CODEX'] })
  await expand(screen.getByRole('region', { name: 'Saved quota history' }).querySelector('details')!)
  expect(screen.getByRole('alert')).toHaveTextContent('CODEX')
  expect(screen.getByRole('alert')).toHaveTextContent('current quota collection remains independent')
  expect(screen.queryByText(/No saved quota observations/)).toBeNull()
})
// Validates closed history panels never issue disk/transport reads simply because current quota is polling.
it('keeps history reads disabled until opened', () => {
  const network = vi.spyOn(globalThis, 'fetch')
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><QuotaHistoryPanel autoRefresh runtime={{ enabled: true, generation: 'closed', refreshInBackground: false }} /></QueryClientProvider>)
  expect(network).not.toHaveBeenCalled()
  network.mockRestore()
})
