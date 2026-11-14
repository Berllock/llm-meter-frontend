import type { QuotaHistoryEntry } from '../api/history'
import { comparisonExplanations } from '../model/comparability'

export function QuotaComparisonDetails({ entry, counts }: { entry: QuotaHistoryEntry; counts: ReadonlyMap<string, number> }) {
  const comparison = entry.comparability
  return <div className="quota-note">
    <p>{comparison?.accountStatus === 'RECORDED_ACCOUNT'
      ? 'Account identified from recorded session metadata. This does not establish the currently signed-in account.'
      : comparison?.accountStatus === 'LEGACY' || !comparison
        ? 'Account identity is unverified. Legacy observations cannot be identified retroactively.'
        : 'Account identity is unverified for this observation.'}</p>
    {comparison?.groups.map(group => <div key={`${group.unit}:${group.index}`}>
      <strong>{group.unit === 'PERCENTAGE' ? `${entry.snapshot.windows[group.index].limitId ?? 'Unspecified scope'} · ${entry.snapshot.windows[group.index].name}` : entry.snapshot.creditQuota!.allowances[group.index].name}</strong>
      {group.key ? <p>Account, plan and reset-window context identified. Matched context in {counts.get(group.key) ?? 1} distinct source {counts.get(group.key) === 1 ? 'timestamp' : 'timestamps'} shown. A forecast still requires recent, consistent samples.</p>
        : <ul>{group.reasons.map(reason => <li key={reason}>{comparisonExplanations[reason]}</li>)}</ul>}
    </div>)}
  </div>
}
