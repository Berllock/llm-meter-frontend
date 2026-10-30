import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { UsageChart } from './UsageChart'

// Validates changing the chart metric updates the selected button, plotted counts, and visible metric summary.
it('switches between input, output, and cached token observations', async () => {
  const user = userEvent.setup()
  render(<UsageChart pending={false} points={[{ date: '2026-10-25', inputTokens: 160, outputTokens: 16, cachedTokens: null }]} />)
  const controls = within(screen.getByRole('group', { name: 'Chart metric' }))
  expect(controls.getByRole('button', { name: 'Input tokens' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('Input tokens · 160 observed tokens')).toBeVisible()
  await user.click(controls.getByRole('button', { name: 'Output tokens' }))
  expect(controls.getByRole('button', { name: 'Output tokens' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Oct 25, Output tokens: 16 tokens' })).toBeVisible()
  expect(screen.getByText('Output tokens · 16 observed tokens')).toBeVisible()
  await user.click(controls.getByRole('button', { name: 'Cached input' }))
  expect(screen.getByRole('button', { name: 'Oct 25, Cached input: unavailable' })).toBeVisible()
  expect(screen.getByText('Cached input · — observed tokens')).toBeVisible()
})
