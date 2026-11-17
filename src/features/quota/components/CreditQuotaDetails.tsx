import type { CreditQuota } from '../model/quota'
import { creditUnits as units, creditIsRecent } from '../model/alerts'

export function CreditQuotaDetails({ quota, observedAt, current, now }: { quota: CreditQuota; observedAt: string; current: boolean; now: number }) {
  return <>
    <p className="quota-note">Account credits queried through Kiro CLI. Queries are limited to once per minute; provider updates may lag. These balances are independent of locally recorded session credits.</p>
    <p>Billing renewal date: {quota.renewalDate ?? 'Not reported'}{quota.renewalDate ? ' (UTC calendar date; exact time not reported)' : ''}</p>
    {quota.overagesEnabled && <p className="quota-note">Overages are enabled for this account. Included credits do not establish a spending cap or an API bill.</p>}
    {quota.allowances.map((allowance, index) => {
      const used = units(allowance.used)
      const limit = units(allowance.limit)
      const recent = current && creditIsRecent(quota, allowance, observedAt, now)
      return <div className="quota-window" key={`${allowance.kind}:${index}`}>
        <strong>{allowance.name} · {allowance.kind.toLowerCase().replace('_', ' ')}</strong>
        <p>{allowance.used} used / {allowance.limit} credits · {allowance.remaining} remaining at query time</p>
        {limit > 0n && <progress max={100} value={Number((used > limit ? limit : used) * 10_000n / limit) / 100} aria-label={`${allowance.name} reported usage`} />}
        {allowance.expiresOn && <p>Expiry date: {allowance.expiresOn} (UTC)</p>}
        {allowance.daysUntilExpiry !== null && <p>Reported days until expiry: {allowance.daysUntilExpiry} · Exact expiry time unavailable</p>}
        <p>{!recent ? 'Current remaining credits are unknown; refresh the account observation.' : 'Recent account query; remaining credits may have changed since this response.'}</p>
        {recent && limit > 0n && used * 5n >= limit * 4n && <strong>{used >= limit ? 'Reported credit allowance exhausted.' : 'Reported credit usage is close to this limit.'}</strong>}
      </div>
    })}
  </>
}
