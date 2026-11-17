import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge, QuotaNotificationState } from '../../../../shared/desktop-contract'

export function QuotaNotificationToggle({ bridge }: { bridge: DesktopBridge }) {
  const [state, setState] = useState<QuotaNotificationState | null>(null)
  const [pending, setPending] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  const revision = useRef(0)
  useEffect(() => {
    let active = true
    const version = revision.current
    const unsubscribe = bridge.onQuotaNotifications(next => { revision.current++; if (active) setState(next) })
    void bridge.getQuotaNotifications().then(next => { if (active && version === revision.current) setState(next) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false; unsubscribe() }
  }, [bridge])
  return <div className="quota-note">
    <label className="auto-refresh"><input type="checkbox" aria-label="Quota desktop notifications" checked={pending ?? state?.enabled ?? false}
      disabled={!state || !state.supported && !state.enabled || pending !== null} onChange={async event => {
        const next = event.target.checked
        setPending(next); setFailed(false)
        try { setState(await bridge.setQuotaNotifications(next)) } catch { setFailed(true) } finally { setPending(null) }
      }} /><span className="toggle" aria-hidden="true" />Quota desktop notifications</label>
    <p>Optional system notifications while this app is open. Follows the Agent filter and Auto-refresh; system settings control delivery.</p>
    {state && !state.supported && <p>System notifications are not supported in this environment. Dashboard alerts remain available.</p>}
    {state?.error && <p role="alert">{state.error === 'STORAGE' ? 'Notification history is unavailable. System alerts are paused; dashboard alerts remain available.'
      : 'System notification delivery failed. Check your system settings, then disable and enable this option for future alerts.'}</p>}
    {failed && <p role="alert">The notification setting could not be loaded or saved. Please try again.</p>}
  </div>
}
