import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { QuotaAlerts } from './QuotaAlerts'
import { percentageQuota, quotaNow, estimatedForecast } from '../../../test/quota'
// Validates current near-limit and forecast evidence is visible, while failed refreshes remove actionable alerts.
it('shows fresh quota conditions and suppresses retained failed data', () => {
  const rows = [percentageQuota({ usedPercent: 85 }), percentageQuota({ usedPercent: 40, limitId: 'other', forecast: estimatedForecast })]
  const view = render(<QuotaAlerts rows={rows} current now={quotaNow} />)
  expect(screen.getByRole('region', { name: 'Quota alerts' })).toHaveTextContent('Reported usage is close to this limit.')
  expect(screen.getByRole('region', { name: 'Quota alerts' })).toHaveTextContent('may run out before its reported reset')
  view.rerender(<QuotaAlerts rows={rows} current={false} now={quotaNow} />)
  expect(screen.queryByRole('region', { name: 'Quota alerts' })).toBeNull()
})
