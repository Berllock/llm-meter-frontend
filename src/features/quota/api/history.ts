import { parseQuota } from './quota'
import { fetchQuotaPayload } from './transport'
import { agents } from '../../usage/model/usage'
import type { Agent } from '../../usage/model/usage'
import type { ProviderQuota } from '../model/quota'
import type { QuotaComparability } from '../model/comparability'
import { parseComparability } from './comparability'

export type QuotaHistoryEntry = Readonly<{ id: string; savedAt: string; accountVerified: boolean; snapshot: NonNullable<ProviderQuota['snapshot']>; provider: Agent; comparability?: QuotaComparability }>
export type QuotaHistory = Readonly<{ status: 'READY' | 'DISABLED' | 'PARTIAL' | 'ERROR'; retentionDays: number; observations: QuotaHistoryEntry[]; failures: Agent[] }>

export function parseQuotaHistory(value: unknown, provider?: Agent): QuotaHistory {
  const invalid = () => new Error('Saved quota history could not be displayed reliably.')
  if (!value || typeof value !== 'object') throw invalid()
  const row = value as Record<string, unknown>
  if (!['READY', 'DISABLED', 'PARTIAL', 'ERROR'].includes(row.status as string) || row.retentionDays !== 30
    || !Array.isArray(row.observations) || row.observations.length > 100 || !Array.isArray(row.failures) || row.failures.length > agents.length) throw invalid()
  const failed = new Set<Agent>()
  for (const source of row.failures) {
    if (!agents.includes(source as Agent) || failed.has(source as Agent) || provider && source !== provider) throw invalid()
    failed.add(source as Agent)
  }
  if ((row.status === 'READY' || row.status === 'DISABLED') && failed.size || (row.status === 'PARTIAL' || row.status === 'ERROR') && !failed.size
    || row.status === 'DISABLED' && row.observations.length) throw invalid()
  const ids = new Set<string>()
  const observations: QuotaHistoryEntry[] = row.observations.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw invalid()
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || !/^[a-f0-9]{64}$/.test(item.id) || ids.has(item.id) || typeof item.savedAt !== 'string' || !Number.isFinite(Date.parse(item.savedAt))
      || typeof item.accountVerified !== 'boolean' || !item.snapshot || typeof item.snapshot !== 'object') throw invalid()
    const snapshot = item.snapshot as Record<string, unknown>
    if (!Array.isArray(snapshot.windows) || snapshot.windows.some(window => !window || typeof window !== 'object' || (window as Record<string, unknown>).forecast !== undefined)) throw invalid()
    const quota = parseQuota([{ provider: snapshot.provider, status: 'OBSERVED', snapshot }], provider)[0]
    const comparability = parseComparability(item.comparability, item.accountVerified, quota)
    ids.add(item.id)
    return { id: item.id, savedAt: item.savedAt, accountVerified: item.accountVerified, snapshot: quota.snapshot!, provider: quota.provider, ...(comparability ? { comparability } : {}) }
  })
  return { status: row.status as QuotaHistory['status'], retentionDays: 30, observations, failures: [...failed] }
}

export async function fetchQuotaHistory(provider?: Agent, signal?: AbortSignal): Promise<QuotaHistory> {
  try { return parseQuotaHistory(await fetchQuotaPayload(provider, signal, true), provider) }
  catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Saved quota history is unavailable. Current quota collection remains independent.')
  }
}
