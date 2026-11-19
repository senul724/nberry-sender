import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { api } from '../../api/client'
import { Button } from '../../ui/Button'

export function LogoutButton() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    try {
      await api.post('/v1/auth/logout', { schema: z.undefined() })
    } catch {
      // The session may already be gone; signing out locally is still the right outcome.
    }
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <Button variant="secondary" loading={busy} onClick={() => void onClick()}>
      Sign out
    </Button>
  )
}
