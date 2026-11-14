import type { ProviderUsageFailure } from '../model/usage'

function explanation(reason: ProviderUsageFailure['reason']): string {
  switch (reason) {
    case 'READ_FAILURE': return 'The local source could not be read.'
    case 'NO_TOKEN_COUNT': case 'NO_USAGE_RECORD': return 'Required usage records are unavailable.'
    case 'UNSUPPORTED_HISTORY': return 'This source format is not supported safely.'
    case 'UNKNOWN': return 'The source could not be collected.'
    default: return 'Recorded data could not be validated safely.'
  }
}

export function UsageSourceFailures({ failures, allFailed, stale, busy, onRetry }: {
  failures: readonly ProviderUsageFailure[]; allFailed: boolean; stale: boolean; busy: boolean; onRetry: () => void
}) {
  if (!failures.length) return null
  return <section className="coverage-banner incomplete" aria-label="Unavailable usage sources">
    <div role="alert">
      <strong>{stale ? 'Last reported source failures; current source availability is unknown.' : allFailed ? 'Usage collection failed for every selected source.' : 'Some agents could not be collected.'}</strong>
      <ul>{failures.map(failure => <li key={failure.provider}><strong>{failure.provider}</strong>: {explanation(failure.reason)}</li>)}</ul>
      <p>{allFailed ? 'Usage and source coverage are unknown. This is not an empty or zero-usage result.' : 'Displayed observations exclude failed agents. Their usage and source coverage are unknown; they are not counted as zero.'}</p>
    </div>
    <button className="button" disabled={busy} onClick={onRetry}>Retry sources</button>
  </section>
}
