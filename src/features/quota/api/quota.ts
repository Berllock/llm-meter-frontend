import { parseForecast } from './forecast'
import { agents } from '../../usage/model/usage'
import type { Agent } from '../../usage/model/usage'
import type { ProviderQuota, QuotaWindow } from '../model/quota'

export function parseQuota(value: unknown, provider?: Agent): ProviderQuota[] {
  const invalid = () => new Error('Quota observations could not be displayed reliably.')
  const time = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
  const label = (v: unknown): v is string | null => v === null || (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(v))
  if (!Array.isArray(value)) throw invalid()
  const seen = new Set<string>()
  return value.map(entry => {
    if (!entry || typeof entry !== 'object') throw invalid()
    const row = entry as Record<string, unknown>
    if (!agents.includes(row.provider as Agent) || seen.has(row.provider as string) || (provider && row.provider !== provider)
      || !['OBSERVED', 'UNAVAILABLE', 'ERROR'].includes(row.status as string)) throw invalid()
    seen.add(row.provider as string)
    if (row.status !== 'OBSERVED') {
      if (row.snapshot !== null) throw invalid()
      return { provider: row.provider as Agent, status: row.status as 'UNAVAILABLE' | 'ERROR', snapshot: null }
    }
    if (!row.snapshot || typeof row.snapshot !== 'object') throw invalid()
    const snapshot = row.snapshot as Record<string, unknown>
    if (!time(snapshot.observedAt) || !time(snapshot.collectedAt) || !label(snapshot.planType) || !Array.isArray(snapshot.windows) || !snapshot.windows.length) throw invalid()
    const ide = row.provider === 'ANTIGRAVITY' && snapshot.source === 'ANTIGRAVITY_IDE'
    if (snapshot.source !== undefined && !ide) throw invalid()
    if (snapshot.excludedWindows !== undefined && (typeof snapshot.excludedWindows !== 'number' || !Number.isSafeInteger(snapshot.excludedWindows) || snapshot.excludedWindows < 0 || snapshot.excludedWindows > 512)) throw invalid()
    const windowsSeen = new Set<string>()
    const windows: QuotaWindow[] = snapshot.windows.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw invalid()
      const w = item as Record<string, unknown>
      if ((ide ? typeof w.name !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(w.name) : !['primary', 'secondary'].includes(w.name as string)) || typeof w.usedPercent !== 'number' || !Number.isFinite(w.usedPercent)
        || w.usedPercent < 0 || w.usedPercent > 100 || (!(ide && w.windowMinutes === null) && (typeof w.windowMinutes !== 'number' || !Number.isSafeInteger(w.windowMinutes) || w.windowMinutes < 1)) || !time(w.resetAt) || !time(w.observedAt) || !label(w.limitId)) throw invalid()
      if (w.displayName !== undefined && (typeof w.displayName !== 'string' || !w.displayName.trim() || w.displayName.length > 200 || Array.from(w.displayName).some(character => { const code = character.charCodeAt(0); return code < 32 || (code >= 127 && code <= 159) }))) throw invalid()
      if (ide && (w.forecast !== undefined && w.forecast !== null)) throw invalid()
      const key = JSON.stringify([w.limitId, w.name])
      if (windowsSeen.has(key)) throw invalid()
      windowsSeen.add(key)
      const window = { name: w.name as string, usedPercent: w.usedPercent, windowMinutes: w.windowMinutes as number | null, resetAt: w.resetAt,
        observedAt: w.observedAt, limitId: w.limitId, ...(typeof w.displayName === 'string' ? { displayName: w.displayName } : {}) }
      const forecast = parseForecast(w.forecast, window)
      return { ...window, ...(forecast ? { forecast } : {}) }
    })
    return { provider: row.provider as Agent, status: 'OBSERVED', snapshot: { observedAt: snapshot.observedAt, collectedAt: snapshot.collectedAt,
      planType: snapshot.planType, windows, ...(ide ? { source: 'ANTIGRAVITY_IDE' as const } : {}), ...(snapshot.excludedWindows !== undefined ? { excludedWindows: snapshot.excludedWindows as number } : {}) } }
  })
}

export async function fetchQuota(provider?: Agent, signal?: AbortSignal): Promise<ProviderQuota[]> {
  const id = crypto.randomUUID()
  const timeout = AbortSignal.timeout(15_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let cancel = () => {}
  try {
    let body: unknown
    if (window.llmMeter) {
      const cancelled = new Promise<never>((_resolve, reject) => {
        cancel = () => { window.llmMeter?.cancelUsage(id); reject(combined.reason) }
        combined.addEventListener('abort', cancel, { once: true })
      })
      combined.throwIfAborted()
      const response = await Promise.race([window.llmMeter.readQuota(provider, id), cancelled])
      if (response.status !== 200) throw new Error('Quota collection unavailable.')
      body = response.body
    } else {
      const response = await fetch(`/api/quota?${new URLSearchParams(provider ? { provider } : {})}`, { signal: combined, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('Quota collection unavailable.')
      body = await response.json()
    }
    return parseQuota(body, provider)
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Quota could not be collected. Usage observations remain independent.')
  } finally { combined.removeEventListener('abort', cancel) }
}
