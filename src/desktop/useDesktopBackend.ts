import { useEffect, useState } from 'react'
import type { BackendState } from '../../shared/desktop-contract'
export function useDesktopBackend() {
  const bridge = window.llmMeter
  const [state, setState] = useState<BackendState>({ phase: bridge ? 'starting' : 'ready', message: 'Starting the local service…', revision: -1, generation: bridge ? '' : 'browser' })
  useEffect(() => {
    if (!bridge) return
    let active = true
    const receive = (next: BackendState) => { if (active) setState(previous => next.revision >= previous.revision ? next : previous) }
    const unsubscribe = bridge.onBackendState(receive)
    void bridge.getBackendState().then(receive).catch(() => { if (active) setState(previous => ({ ...previous, phase: 'error', message: 'The desktop service is unavailable. Reopen the application to retry.' })) })
    return () => { active = false; unsubscribe() }
  }, [bridge])
  return { state, bridge }
}
