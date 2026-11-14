import type { CreditQuota } from '../model/quota'

const units = (value: string) => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0')) }

export function CreditQuotaDetails({ quota, observedAt, current, now }: { quota: CreditQuota; observedAt: string; current: boolean; now: number }) {
  const age = now - Date.parse(observedAt)
  const fresh = current && age >= -60_000 && age <= 300_000
  return <>
    <p className="quota-note">Account credits queried through Kiro CLI. Queries are limited to once per minute; provider updates may lag. These balances are independent of locally recorded session credits.</p>
    <p>Billing renewal date: {quota.renewalDate ?? 'Not reported'}{quota.renewalDate ? ' (UTC calendar date; exact time not reported)' : ''}</p>
    {quota.overagesEnabled && <p className="quota-note">Overages are enabled for this account. Included credits do not establish a spending cap or an API bill.</p>}
    {quota.allowances.map((allowance, index) => {
      const cyclePassed = allowance.kind === 'SUBSCRIPTION' && quota.renewalDate !== null && quota.renewalDate <= new Date(now).toISOString().slice(0, 10)
      const expiryPassed = allowance.expiresOn !== null && allowance.expiresOn <= new Date(now).toISOString().slice(0, 10)
      const used = units(allowance.used)
      const limit = units(allowance.limit)
      const recent = fresh && !cyclePassed && !expiryPassed && allowance.daysUntilExpiry !== 0
      return <div className="quota-window" key={`${allowance.kind}:${index}`}>
        <strong>{allowance.name} · {allowance.kind.toLowerCase().replace('_', ' ')}</strong>
        <p>{allowance.used} used / {allowance.limit} credits · {allowance.remaining} remaining at query time</p>
        {limit > 0n && <progress max={100} value={Number((used > limit ? limit : used) * 10_000n / limit) / 100} aria-label={`${allowance.name} reported usage`} />}
        {allowance.expiresOn && <p>Expiry date: {allowance.expiresOn} (UTC)</p>}
        {allowance.daysUntilExpiry !== null && <p>Reported days until expiry: {allowance.daysUntilExpiry} · Exact expiry time unavailable</p>}
        <p>{!recent ? 'Current remaining credits are unknown; refresh the account observation.' : 'Recent account query; remaining credits may have changed since this response.'}</p>
        {recent && used * 5n >= limit * 4n && <strong>{used >= limit ? 'Reported credit allowance exhausted.' : 'Reported credit usage is close to this limit.'}</strong>}
      </div>
    })}
  </>
}
