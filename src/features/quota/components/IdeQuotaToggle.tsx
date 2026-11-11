import { useState } from 'react'

export function IdeQuotaToggle({ enabled, busy, onChange, label = 'Read Antigravity IDE quota' }: { label?: string; enabled: boolean; busy: boolean; onChange: (enabled: boolean) => Promise<void> }) {
  const [pending, setPending] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  return <>
    <label className="auto-refresh"><input type="checkbox" aria-label={label} checked={pending ?? enabled} disabled={busy || pending !== null}
      onChange={async event => {
        const next = event.target.checked
        setPending(next); setFailed(false)
        try { await onChange(next) } catch { setFailed(true) } finally { setPending(null) }
      }} /><span className="toggle" aria-hidden="true" />{label}</label>
    {failed && <p role="alert">The IDE quota setting could not be changed. Please try again.</p>}
  </>
}
