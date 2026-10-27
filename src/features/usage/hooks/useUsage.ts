import { useQuery } from '@tanstack/react-query'
import { fetchDailyUsage } from '../api/usage'
import type { UsagePeriod } from '../model/usage'

export function useUsage(period: UsagePeriod, autoRefresh: boolean) {
  return useQuery({
    queryKey: ['usage', 'daily', period.from, period.to, period.zone],
    queryFn: ({ signal }) => fetchDailyUsage(period, signal),
    networkMode: 'always', retry: false, staleTime: 5_000, gcTime: 60_000,
    refetchInterval: autoRefresh ? 5_000 : false,
    refetchIntervalInBackground: false, refetchOnWindowFocus: autoRefresh,
  })
}
