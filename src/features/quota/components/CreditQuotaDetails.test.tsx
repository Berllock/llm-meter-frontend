import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { CreditQuotaDetails } from './CreditQuotaDetails'
import type { CreditQuota } from '../model/quota'
const observedAt = '2026-11-11T12:00:00Z'
const quota: CreditQuota = { planName: 'Synthetic Free', renewalDate: '2026-12-01', overagesEnabled: true,
  allowances: [{ kind: 'SUBSCRIPTION', name: 'Plan credits', used: '42.1', limit: '50', remaining: '7.9', expiresOn: null, daysUntilExpiry: null }] }
// Validates account balances, renewal precision and overage information are distinct from local session observations.
it('shows account credit pools with explicit provenance', () => {
  render(<CreditQuotaDetails quota={quota} observedAt={observedAt} current now={Date.parse(observedAt)} />)
  expect(screen.getByText(/42.1 used \/ 50 credits/)).toBeVisible()
  expect(screen.getByText(/Billing renewal date/)).toHaveTextContent('exact time not reported')
  expect(screen.getByText(/Overages are enabled/)).toBeVisible()
  expect(screen.getByText(/independent of locally recorded/)).toBeVisible()
})
// Validates stale data, failed refreshes and elapsed renewal dates never imply a current balance or automatic refill.
it('marks stale and expired account observations as unknown', () => {
  const view = render(<CreditQuotaDetails quota={quota} observedAt={observedAt} current={false} now={Date.parse(observedAt)} />)
  expect(screen.getByText(/Current remaining credits are unknown/)).toBeVisible()
  view.rerender(<CreditQuotaDetails quota={quota} observedAt="2026-12-01T12:00:00Z" current now={Date.parse('2026-12-01T12:00:00Z')} />)
  expect(screen.getByText(/Current remaining credits are unknown/)).toBeVisible()
})
