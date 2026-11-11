import { QuotaForecastDetails } from './QuotaForecastDetails'
import { useState } from 'react'
import { useQuota } from '../hooks/useQuota'
import { windowState } from '../model/quota'
import type { Agent } from '../../usage/model/usage'

export function QuotaPanel({ provider, autoRefresh, runtime, now }: { provider?: Agent; autoRefresh: boolean; now: Date;
  runtime: { enabled: boolean; generation: string; refreshInBackground: boolean } }) {
  const query = useQuota(provider, autoRefresh, runtime)
  const [plan, setPlan] = useState(() => { try { const saved = localStorage.getItem('llmeter.codex-plan'); return saved === 'plus' || saved === 'pro' ? saved : 'auto' } catch { return 'auto' } })
  const rows = query.data ?? []
  const showPlan = !provider || provider === 'CODEX'
  return <section className="panel quota-panel" aria-label="Plan quota observations">
    <div className="panel-heading"><div><p className="eyebrow">LAST REPORTED ACCOUNT WINDOWS</p><h2>Plan limits</h2></div>
      <button className="button" disabled={!runtime.enabled || query.isFetching} onClick={() => void query.refetch()}>Refresh quota</button></div>
    {showPlan && <label className="quota-plan">Configured Codex plan <select aria-label="Configured Codex plan" value={plan} onChange={event => {
      setPlan(event.target.value); try { localStorage.setItem('llmeter.codex-plan', event.target.value) } catch { /* Selection remains usable for this session. */ }
    }}><option value="auto">Use reported plan</option><option value="plus">Plus</option><option value="pro">Pro (tier not verified)</option></select></label>}
    <p className="quota-note">Quota is independent of the calendar period. These are recorded observations, not a live account balance. Selecting a plan does not change the provider's limits.</p>
    {query.isError && <p className="quota-note">Quota refresh failed.{query.data ? ' Last successful quota collection; current quota is unknown.' : ' No quota result is available.'}</p>}
    {!query.data && query.isPending && <p className="quota-note">{runtime.enabled ? 'Loading quota observations…' : 'Waiting for the local service.'}</p>}
    {query.data && !rows.length && <p className="quota-note">No configured source for this agent.</p>}
    {rows.map(row => <div key={row.provider} className="quota-provider"><h3>{row.provider}</h3>
      {row.status !== 'OBSERVED' || !row.snapshot ? <p>{row.status === 'ERROR' ? 'Quota source could not be read safely.' : 'No supported quota observation is available for this source.'}</p> : <>
        <p>Reported plan: {row.snapshot.planType ?? 'Not identified'} · {row.snapshot?.source === 'ANTIGRAVITY_IDE' ? 'Queried' : 'Observed'} {new Date(row.snapshot.observedAt).toLocaleString()}</p>
        {row.provider === 'CODEX' && plan !== 'auto' && plan !== row.snapshot.planType && <p className="quota-mismatch">Selected plan differs from the recorded plan. Values below still belong to the reported account plan; no upgrade capacity is simulated.</p>}
        {row.snapshot?.source === 'ANTIGRAVITY_IDE' && <p className="quota-note">Quota returned by the local Antigravity IDE. Queries are limited to once per minute; provider-side updates may lag. Account plan is not inferred from token counts. Forecasting is not enabled for this source.</p>}
        {!!row.snapshot.excludedWindows && <p className="quota-note">{row.snapshot.excludedWindows} quota buckets omitted because their unit or reset could not be represented. Values shown cover supported percentage buckets only.</p>}
        {row.snapshot.windows.map(window => {
          const state = windowState(window, now.getTime())
          const recent = state === 'recent' && !query.isError && runtime.enabled
          return <div className="quota-window" key={`${window.limitId ?? ''}:${window.name}`}>
            <strong>{window.displayName ?? window.limitId ?? 'Unspecified quota scope'} · {window.name} · {window.windowMinutes === null ? 'Duration not reported' : `${window.windowMinutes} minutes`}</strong>
            <p>{window.usedPercent.toLocaleString(undefined, { maximumFractionDigits: 2 })}% last reported used · {(100 - window.usedPercent).toLocaleString(undefined, { maximumFractionDigits: 2 })}% last reported remaining</p>
            <progress max={100} value={window.usedPercent} aria-label={`${row.provider} ${window.limitId ?? 'unspecified'} ${window.name} reported usage`} />
            <p>Reset reported for {new Date(window.resetAt).toLocaleString()} · {row.snapshot?.source === 'ANTIGRAVITY_IDE' ? 'Queried' : 'Observed'} {new Date(window.observedAt).toLocaleString()}</p>
            <p>{state === 'expired' ? 'Reset time has passed; current remaining quota is unknown.' : recent ? (row.snapshot?.source === 'ANTIGRAVITY_IDE' ? 'Recent IDE query; provider state may have changed since this response.' : 'Recent observation; usage outside these logs may differ.') : 'Stale or unverified observation; current remaining quota is unknown.'}</p>
            {row.snapshot?.source !== 'ANTIGRAVITY_IDE' && <QuotaForecastDetails window={window} recent={recent} now={now.getTime()} />}
            {recent && window.usedPercent >= 80 && <strong>{window.usedPercent >= 100 ? 'Reported allowance exhausted.' : 'Reported usage is close to this limit.'}</strong>}
          </div>
        })}
      </>}
    </div>)}
    <p className="quota-note">Forecasts use comparable recent quota observations. Plan-upgrade simulation is not available yet. Model usage alone does not establish an absolute token allowance or an API bill.</p>
  </section>
}
