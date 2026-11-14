import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchQuotaHistory } from '../api/history'
import type { QuotaHistoryEntry } from '../api/history'
import type { Agent } from '../../usage/model/usage'

function SavedObservation({ entry }: { entry: QuotaHistoryEntry }) {
  const [open, setOpen] = useState(false)
  const snapshot = entry.snapshot
  return <li><details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{entry.provider} · {snapshot.source ? 'Queried' : 'Observed'} {new Date(snapshot.observedAt).toLocaleString()} · {snapshot.creditQuota ? 'Credit pools' : `${snapshot.windows.length} quota windows`}</summary>
    {open && <div className="quota-window">
      <p>First saved {new Date(entry.savedAt).toLocaleString()} · Reported plan: {snapshot.creditQuota?.planName ?? snapshot.planType ?? 'Not identified'}</p>
      {snapshot.windows.map(window => <p key={`${window.limitId}:${window.name}`}>
        {window.displayName ?? window.limitId ?? 'Unspecified scope'} · {window.name}: {window.usedPercent.toLocaleString(undefined, { maximumFractionDigits: 2 })}% used at observation · {snapshot.source ? 'Queried' : 'Observed'} {new Date(window.observedAt).toLocaleString()} · Reset reported for {new Date(window.resetAt).toLocaleString()}
      </p>)}
      {!!snapshot.excludedWindows && <p>{snapshot.excludedWindows} unsupported buckets were omitted from this observation.</p>}
      {snapshot.creditQuota && <>
        <p>Reported renewal date: {snapshot.creditQuota.renewalDate ?? 'Not reported'} · Exact reset time unavailable</p>
        {snapshot.creditQuota.allowances.map((allowance, index) => <p key={`${allowance.kind}:${index}`}>
          {allowance.name}: {allowance.used} used / {allowance.limit} credits · {allowance.remaining} remaining at observation
          {allowance.expiresOn ? ` · Reported expiry date: ${allowance.expiresOn}` : ''}
          {allowance.daysUntilExpiry !== null ? ` · Reported days until expiry: ${allowance.daysUntilExpiry}` : ''}
        </p>)}
      </>}
    </div>}
  </details></li>
}

export function QuotaHistoryPanel({ provider, autoRefresh, runtime }: { provider?: Agent; autoRefresh: boolean;
  runtime: { enabled: boolean; generation: string; refreshInBackground: boolean } }) {
  const [open, setOpen] = useState(false)
  const query = useQuery({ enabled: runtime.enabled && open, queryKey: ['quota-history', runtime.generation, provider ?? 'ALL'],
    queryFn: ({ signal }) => fetchQuotaHistory(provider, signal), retry: false, networkMode: 'always', staleTime: 15_000, gcTime: 60_000,
    refetchInterval: open && autoRefresh ? 30_000 : false, refetchIntervalInBackground: runtime.refreshInBackground, refetchOnWindowFocus: autoRefresh })
  return <section className="panel quota-panel" aria-label="Saved quota history"><details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Saved quota observations</summary>
    {open && <>
      <p className="quota-note">Saved observations are historical records, not a current balance. Account identity is unverified; observations are not combined across reset windows or used for new forecasts.</p>
      <button className="button" disabled={!runtime.enabled || query.isFetching} onClick={() => void query.refetch()}>Refresh saved history</button>
      {query.isPending && <p className="quota-note">{runtime.enabled ? 'Loading saved observations…' : 'Waiting for the local service.'}</p>}
      {query.isError && <p role="alert">Saved history could not be refreshed.{query.data ? ' Showing the last loaded archive response.' : ''} Current quota collection remains independent.</p>}
      {query.data?.status === 'DISABLED' && <p>Quota history storage is disabled. Desktop mode enables local storage automatically; browser mode requires backend configuration.</p>}
      {!!query.data?.failures.length && <p role="alert">History could not be read or saved for {query.data.failures.join(', ')}. Existing files are preserved; current quota collection remains independent.</p>}
      {query.data && query.data.status !== 'DISABLED' && <>
        <p className="quota-note">Latest {query.data.observations.length} saved observations for the configured sources · Up to {query.data.retentionDays} days retained, subject to storage limits. History starts when observations are saved.</p>
        {!query.data.observations.length && query.data.status === 'READY' && <p>No saved quota observations for these sources yet.</p>}
        <ol>{query.data.observations.map(entry => <SavedObservation key={entry.id} entry={entry} />)}</ol>
      </>}
    </>}
  </details></section>
}
