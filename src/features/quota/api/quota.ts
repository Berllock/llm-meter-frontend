import { fetchQuotaPayload } from './transport'
import { parseQuota } from './quotaParser'
import type { Agent } from '../../usage/model/usage'
import type { ProviderQuota } from '../model/quota'
export { parseQuota } from './quotaParser'

export async function fetchQuota(provider?: Agent, signal?: AbortSignal): Promise<ProviderQuota[]> {
  try { return parseQuota(await fetchQuotaPayload(provider, signal), provider) }
  catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Quota could not be collected. Usage observations remain independent.')
  }
}
