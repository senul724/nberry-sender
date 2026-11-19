import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/render'
import { CopyField } from './CopyField'
import { Dialog } from './Dialog'
import { Field } from './Field'

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Confirm">
        <button>Inside</button>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DialogHarness />)
    const trigger = screen.getByRole('button', { name: 'Open it' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})

describe('CopyField', () => {
  afterEach(() => vi.restoreAllMocks())

  it('copies its value via navigator.clipboard.writeText and shows Copied', async () => {
    const user = userEvent.setup() // installs a clipboard stub on navigator
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderWithProviders(<CopyField label="API key" value="nb_secret_123" />)
    expect(screen.getByLabelText('API key')).toHaveValue('nb_secret_123')
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('nb_secret_123')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })
})

describe('Field', () => {
  it('links its label to the input and renders its error with aria-invalid', () => {
    renderWithProviders(<Field label="Email" error="Required" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Required')
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
  })

  it('is not invalid without an error', () => {
    renderWithProviders(<Field label="Email" />)
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid', 'true')
  })
})

describe('config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('strips a trailing slash from VITE_LINK_BASE_URL', async () => {
    vi.stubEnv('VITE_LINK_BASE_URL', 'https://links.example.com//')
    vi.resetModules()
    const { config } = await import('../config')
    expect(config.linkBaseUrl).toBe('https://links.example.com')
  })

  it('defaults VITE_LINK_BASE_URL to https://nberry.app', async () => {
    vi.stubEnv('VITE_LINK_BASE_URL', '')
    vi.resetModules()
    const { config } = await import('../config')
    expect(config.linkBaseUrl).toBe('https://nberry.app')
    expect(config.apiBaseUrl).toBe('')
    expect(config.googleClientId).toBeUndefined()
  })
})
