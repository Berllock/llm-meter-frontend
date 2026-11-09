import { displayDate } from '../model/dates'
import { formatTokens, formatCredits } from '../model/usage'
import type { DailyUsage } from '../model/usage'

export function UsageTable({ rows, creditOnly = false }: { rows: readonly DailyUsage[]; creditOnly?: boolean }) {
  const hasCredits = creditOnly || rows.some(row => row.credits !== undefined)
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.provider.localeCompare(b.provider))
  return <section className="panel records-panel" id="records" aria-labelledby="records-title">
    <div className="panel-heading"><div><p className="eyebrow">THE DETAILS</p><h2 id="records-title">{creditOnly ? 'Daily credit records' : 'Daily records'}</h2></div><span className="count-badge">{rows.length} records</span></div>
    <div className="table-scroll"><table><caption className="sr-only">{creditOnly ? 'Recorded daily credits by provider. A dash means unavailable.' : 'Observed daily usage by provider. A dash means unavailable.'}</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Provider</th>{!creditOnly && <><th scope="col">Input tokens</th><th scope="col">Output tokens</th><th scope="col">Cached input</th></>}{hasCredits && <th scope="col">Credits</th>}</tr></thead>
      <tbody>{sorted.map(row => <tr key={`${row.date}:${row.provider}`}><th scope="row"><time dateTime={row.date}>{displayDate(row.date)}</time><span className="year">{row.date.slice(0, 4)}</span></th><td><span className="provider-mark" aria-hidden="true">↗</span>{row.provider}</td>
        {!creditOnly && [row.inputTokens, row.outputTokens, row.cachedTokens].map((value, index) => <td key={index} aria-label={value === null ? 'Unavailable' : undefined}>{formatTokens(value)}</td>)}
        {hasCredits && <td title={row.credits ?? 'Unavailable'}>{formatCredits(row.credits ?? null)}</td>}
      </tr>)}</tbody>
    </table></div>
  </section>
}
