import type { DesktopBridge, DesktopPeriod, DesktopResponse } from '../../shared/desktop-contract'
export async function readDesktopUsage(bridge: DesktopBridge, period: DesktopPeriod, signal?: AbortSignal): Promise<DesktopResponse> {
  signal?.throwIfAborted()
  const id = crypto.randomUUID()
  let cancel: () => void = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => { bridge.cancelUsage(id); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')) }
    signal?.addEventListener('abort', cancel, { once: true })
  })
  try { return await Promise.race([bridge.readDailyUsage(period, id), aborted]) }
  finally { signal?.removeEventListener('abort', cancel) }
}
