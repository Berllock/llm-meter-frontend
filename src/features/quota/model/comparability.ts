export const comparisonReasons = ['ACCOUNT_UNVERIFIED', 'LEGACY_OBSERVATION', 'PLAN_UNVERIFIED', 'SCOPE_UNVERIFIED', 'WINDOW_DURATION_UNVERIFIED', 'RESET_DATE_ONLY', 'CYCLE_UNVERIFIED', 'POOL_UNIDENTIFIED'] as const
export type ComparisonReason = (typeof comparisonReasons)[number]
export type ComparisonGroup = Readonly<{ unit: 'PERCENTAGE' | 'CREDITS'; index: number; key: string | null; reasons: ComparisonReason[] }>
export type QuotaComparability = Readonly<{ accountStatus: 'RECORDED_ACCOUNT' | 'UNVERIFIED' | 'LEGACY'; groups: ComparisonGroup[] }>
export const comparisonExplanations: Record<ComparisonReason, string> = {
  ACCOUNT_UNVERIFIED: 'Account identity is unavailable in this quota observation.',
  LEGACY_OBSERVATION: 'This record predates account evidence and cannot be identified retroactively.',
  PLAN_UNVERIFIED: 'A stable reported plan identifier is unavailable.',
  SCOPE_UNVERIFIED: 'Quota scope is unidentified.',
  WINDOW_DURATION_UNVERIFIED: 'Window duration is unreported.',
  RESET_DATE_ONLY: 'The reported renewal or expiry is a date, not an exact reset time.',
  CYCLE_UNVERIFIED: 'The cycle or expiry boundary is unidentified.',
  POOL_UNIDENTIFIED: 'This credit pool has no stable identifier for matching observations.',
}

export function contextObservationCounts(entries: readonly { comparability?: QuotaComparability; snapshot: { windows: readonly { observedAt: string }[] } }[]): Map<string, number> {
  const times = new Map<string, Set<string>>()
  for (const entry of entries) for (const group of entry.comparability?.groups ?? []) {
    if (!group.key || group.unit !== 'PERCENTAGE') continue
    const observations = times.get(group.key) ?? new Set<string>()
    observations.add(entry.snapshot.windows[group.index].observedAt)
    times.set(group.key, observations)
  }
  return new Map([...times].map(([key, values]) => [key, values.size]))
}

