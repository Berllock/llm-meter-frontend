import { fireEvent, render, screen, act } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { IdeQuotaToggle } from './IdeQuotaToggle'

// Validates a slow backend restart cannot visually revert the requested choice or accept duplicate clicks.
it('keeps the selected state while a change is pending', async () => {
  let resolve = () => {}
  const onChange = vi.fn(() => new Promise<void>(done => { resolve = done }))
  const view = render(<IdeQuotaToggle enabled={false} busy={false} onChange={onChange} />)
  const toggle = screen.getByLabelText('Read Antigravity IDE quota')
  fireEvent.click(toggle)
  expect(toggle).toBeChecked()
  expect(toggle).toBeDisabled()
  expect(onChange).toHaveBeenCalledWith(true)
  view.rerender(<IdeQuotaToggle enabled busy={false} onChange={onChange} />)
  await act(async () => resolve())
  expect(toggle).toBeChecked()
  expect(toggle).toBeEnabled()
})

// Validates a rejected setting operation returns to authoritative state and exposes only a safe retry message.
it('recovers from failed setting changes', async () => {
  const onChange = vi.fn().mockRejectedValue(new Error('PRIVATE_IPC_DETAIL'))
  render(<IdeQuotaToggle enabled={false} busy={false} onChange={onChange} />)
  await act(async () => fireEvent.click(screen.getByLabelText('Read Antigravity IDE quota')))
  expect(screen.getByLabelText('Read Antigravity IDE quota')).not.toBeChecked()
  expect(screen.getByRole('alert')).toHaveTextContent('The IDE quota setting could not be changed.')
  expect(screen.getByRole('alert')).not.toHaveTextContent('PRIVATE_IPC_DETAIL')
})
