import { validCredits } from '../../usage/model/usage'
import type { CreditAllowance, CreditQuota } from '../model/quota'

export function parseCreditQuota(value: unknown): CreditQuota {
  const invalid = () => new Error('Account credits could not be displayed reliably.')
  const date = (v: unknown): v is string | null => v === null || typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
  const label = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 160 && !/[\p{Cc}]/u.test(v)
  const scaled = (v: string) => { const [whole, fraction = ''] = v.split('.'); return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0')) }
  if (!value || typeof value !== 'object') throw invalid()
  const quota = value as Record<string, unknown>
  if (!label(quota.planName) || !date(quota.renewalDate) || typeof quota.overagesEnabled !== 'boolean' || !Array.isArray(quota.allowances) || quota.allowances.length < 1 || quota.allowances.length > 129) throw invalid()
  let subscriptions = 0
  const allowances: CreditAllowance[] = quota.allowances.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw invalid()
    const row = entry as Record<string, unknown>
    if (!['SUBSCRIPTION', 'BONUS', 'ADD_ON'].includes(row.kind as string) || !label(row.name) || !validCredits(row.used) || !validCredits(row.limit) || !validCredits(row.remaining)
      || !date(row.expiresOn) || !(row.daysUntilExpiry === null || typeof row.daysUntilExpiry === 'number' && Number.isSafeInteger(row.daysUntilExpiry) && row.daysUntilExpiry >= 0)) throw invalid()
    if (row.kind === 'SUBSCRIPTION' && ++subscriptions > 1) throw invalid()
    if (row.kind !== 'ADD_ON' && row.expiresOn !== null || row.kind !== 'BONUS' && row.daysUntilExpiry !== null) throw invalid()
    const remaining = scaled(row.limit) - scaled(row.used)
    if (scaled(row.remaining) !== (remaining < 0n ? 0n : remaining)) throw invalid()
    return row as unknown as CreditAllowance
  })
  return { planName: quota.planName, renewalDate: quota.renewalDate, overagesEnabled: quota.overagesEnabled, allowances }
}
