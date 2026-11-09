import { formatTokens, summarizeUsage } from '../model/usage'
import type { ModelDailyUsage } from '../model/usage'

export function ModelUsageTable({ rows }: { rows: readonly ModelDailyUsage[] }) {
  const groups = new Map<string | null, ModelDailyUsage[]>()
  for (const row of rows) groups.set(row.model, [...(groups.get(row.model) ?? []), row])
  return <section className="panel records-panel" aria-label="Codex model observations">
    <div className="panel-heading"><div><p className="eyebrow">RECORDED TURN CONTEXT</p><h2>Codex usage by model</h2></div></div>
    <div className="table-scroll"><table><caption className="sr-only">Codex observed token increments by recorded model in the selected period.</caption>
      <thead><tr><th scope="col">Model</th><th scope="col">Input tokens</th><th scope="col">Output tokens</th><th scope="col">Cached input</th></tr></thead>
      <tbody>{[...groups].sort(([a], [b]) => (a ?? '').localeCompare(b ?? '')).map(([model, values]) => {
        const total = summarizeUsage(values)
        return <tr key={JSON.stringify(model)}><th scope="row">{model ?? 'Model not identified'}</th><td>{formatTokens(total.inputTokens)}</td><td>{formatTokens(total.outputTokens)}</td><td>{formatTokens(total.cachedTokens)}</td></tr>
      })}</tbody>
    </table></div><p className="quota-note">Model names come from recorded turn context. Ambiguous increments stay unidentified; other agents are not included in this breakdown.</p>
  </section>
}
