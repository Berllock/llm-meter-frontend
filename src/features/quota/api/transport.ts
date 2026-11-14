import type { Agent } from '../../usage/model/usage'

export async function fetchQuotaPayload(provider: Agent | undefined, signal: AbortSignal | undefined, history = false): Promise<unknown> {
  const id = crypto.randomUUID()
  const timeout = AbortSignal.timeout(history ? 15_000 : 35_000)
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
      const response = await Promise.race([(history ? window.llmMeter.readQuotaHistory(provider, id) : window.llmMeter.readQuota(provider, id)), cancelled])
      if (response.status !== 200) throw new Error('Quota collection unavailable.')
      body = response.body
    } else {
      const response = await fetch(`/api/quota${history ? '/history' : ''}?${new URLSearchParams(provider ? { provider } : {})}`, { signal: combined, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('Quota collection unavailable.')
      body = await response.json()
    }
    return body
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Quota could not be collected. Usage observations remain independent.')
  } finally { combined.removeEventListener('abort', cancel) }
}
