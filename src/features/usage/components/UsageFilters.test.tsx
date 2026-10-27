import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { UsageFilters } from './UsageFilters'

// Validates that a reversed interval shows an accessible error without submitting the query.
it('blocks a reversed period before collection', async () => {
  const apply = vi.fn()
  const user = userEvent.setup()
  render(<UsageFilters period={{ from: '2026-10-26', to: '2026-10-24', zone: 'UTC' }} preset="custom" onPreset={vi.fn()} onApply={apply} />)
  await user.click(screen.getByRole('button', { name: 'Apply filters' }))
  expect(screen.getByRole('alert')).toHaveTextContent('start date')
  expect(apply).not.toHaveBeenCalled()
})
