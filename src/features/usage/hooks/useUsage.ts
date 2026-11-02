import { useQuery } from '@tanstack/react-query'
import { fetchDailyUsage } from '../api/usage'
import type { UsageQuery } from '../model/usage'

type Runtime = { enabled: boolean; generation: string; refreshInBackground?: boolean }

export function useUsage(period: UsageQuery, autoRefresh: boolean, runtime: Runtime = { enabled: true, generation: 'browser' }) {
  return useQuery({
    enabled: runtime.enabled,
    queryKey: ['usage', 'daily-collection', runtime.generation, period.from, period.to, period.zone, period.provider ?? 'ALL'],
    queryFn: ({ signal }) => fetchDailyUsage(period, signal),
    networkMode: 'always', retry: false, staleTime: 5_000, gcTime: 60_000,
    refetchInterval: autoRefresh ? 5_000 : false,
    refetchIntervalInBackground: runtime.refreshInBackground ?? false, refetchOnWindowFocus: autoRefresh,
  })
}
