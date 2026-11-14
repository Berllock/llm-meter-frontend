import { comparisonReasons } from '../model/comparability'
import type { QuotaComparability, ComparisonGroup, ComparisonReason } from '../model/comparability'
import type { ProviderQuota } from '../model/quota'

export function parseComparability(value: unknown, accountVerified: boolean, quota: ProviderQuota): QuotaComparability | undefined {
  const invalid = () => new Error('Saved quota context could not be verified reliably.')
  if (value === undefined) { if (accountVerified) throw invalid(); return undefined }
  if (!value || typeof value !== 'object' || !quota.snapshot) throw invalid()
  const row = value as Record<string, unknown>
  if (!['RECORDED_ACCOUNT', 'UNVERIFIED', 'LEGACY'].includes(row.accountStatus as string) || !Array.isArray(row.groups)) throw invalid()
  if (accountVerified !== (row.accountStatus === 'RECORDED_ACCOUNT') || accountVerified && quota.provider !== 'CODEX') throw invalid()
  const snapshot = quota.snapshot
  const credits = snapshot.creditQuota
  const size = credits ? credits.allowances.length : snapshot.windows.length
  if (row.groups.length !== size) throw invalid()
  const indices = new Set<number>()
  const groups: ComparisonGroup[] = row.groups.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw invalid()
    const group = entry as Record<string, unknown>
    if (group.unit !== (credits ? 'CREDITS' : 'PERCENTAGE') || typeof group.index !== 'number' || !Number.isSafeInteger(group.index)
      || group.index < 0 || group.index >= size || indices.has(group.index) || !Array.isArray(group.reasons)
      || group.reasons.some(reason => !comparisonReasons.includes(reason as ComparisonReason)) || new Set(group.reasons).size !== group.reasons.length) throw invalid()
    const reasons = group.reasons as ComparisonReason[]
    indices.add(group.index)
    if (!(group.key === null || typeof group.key === 'string' && /^[a-f0-9]{64}$/.test(group.key)) || (group.key === null) !== (group.reasons.length > 0)) throw invalid()
    const required: ComparisonReason[] = []
    if (row.accountStatus === 'UNVERIFIED') required.push('ACCOUNT_UNVERIFIED')
    if (row.accountStatus === 'LEGACY') required.push('LEGACY_OBSERVATION')
    if (!snapshot.planType || snapshot.planType.toLowerCase() === 'unknown') required.push('PLAN_UNVERIFIED')
    if (credits) {
      const allowance = credits.allowances[group.index]
      if (allowance.kind !== 'SUBSCRIPTION') required.push('POOL_UNIDENTIFIED')
      required.push((allowance.kind === 'SUBSCRIPTION' ? credits.renewalDate : allowance.expiresOn) ? 'RESET_DATE_ONLY' : 'CYCLE_UNVERIFIED')
    } else {
      if (snapshot.windows[group.index].limitId === null) required.push('SCOPE_UNVERIFIED')
      if (snapshot.windows[group.index].windowMinutes === null) required.push('WINDOW_DURATION_UNVERIFIED')
    }
    if (required.some(reason => !reasons.includes(reason)) || group.key !== null && (!accountVerified || credits)
      || accountVerified && (group.reasons.includes('ACCOUNT_UNVERIFIED') || group.reasons.includes('LEGACY_OBSERVATION'))) throw invalid()
    return { unit: group.unit as ComparisonGroup['unit'], index: group.index, key: group.key as string | null, reasons: group.reasons as ComparisonReason[] }
  })
  return { accountStatus: row.accountStatus as QuotaComparability['accountStatus'], groups }
}
