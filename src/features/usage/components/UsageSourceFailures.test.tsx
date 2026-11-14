import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { UsageSourceFailures } from './UsageSourceFailures'
const failures = [{ provider: 'ANTIGRAVITY' as const, reason: 'INVALID_SEQUENCE' as const }]

// Validates a partial result identifies its failed agent, describes unknown coverage and offers a scoped retry action.
it('explains source failures without hiding healthy observations', () => {
  const retry = vi.fn()
  render(<UsageSourceFailures failures={failures} allFailed={false} stale={false} busy={false} onRetry={retry} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Some agents could not be collected.')
  expect(screen.getByRole('alert')).toHaveTextContent('ANTIGRAVITY')
  expect(screen.getByRole('alert')).toHaveTextContent('not counted as zero')
  expect(screen.getByRole('alert')).not.toHaveTextContent('INVALID_SEQUENCE')
  fireEvent.click(screen.getByRole('button', { name: 'Retry sources' }))
  expect(retry).toHaveBeenCalledOnce()
})
// Validates all-source failures never appear empty, and transport failures label cached source errors as historical.
it('distinguishes total failure from stale source availability', () => {
  const view = render(<UsageSourceFailures failures={failures} allFailed stale={false} busy onRetry={() => {}} />)
  expect(screen.getByRole('alert')).toHaveTextContent('failed for every selected source')
  expect(screen.getByRole('alert')).toHaveTextContent('not an empty or zero-usage result')
  expect(screen.getByRole('button')).toBeDisabled()
  view.rerender(<UsageSourceFailures failures={failures} allFailed stale busy={false} onRetry={() => {}} />)
  expect(screen.getByRole('alert')).toHaveTextContent('current source availability is unknown')
  view.rerender(<UsageSourceFailures failures={[]} allFailed={false} stale={false} busy={false} onRetry={() => {}} />)
  expect(screen.queryByRole('alert')).toBeNull()
})
