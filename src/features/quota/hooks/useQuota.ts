import { useQuery } from '@tanstack/react-query'
import { fetchQuota } from '../api/quota'
import type { Agent } from '../../usage/model/usage'
export function useQuota(provider: Agent | undefined, autoRefresh: boolean, runtime: { enabled: boolean; generation: string; refreshInBackground: boolean }) {
  return useQuery({ enabled: runtime.enabled, queryKey: ['quota', runtime.generation, provider ?? 'ALL'], queryFn: ({ signal }) => fetchQuota(provider, signal),
    networkMode: 'always', retry: false, staleTime: 5_000, gcTime: 60_000, refetchInterval: autoRefresh ? 5_000 : false,
    refetchIntervalInBackground: runtime.refreshInBackground, refetchOnWindowFocus: autoRefresh })
}
