import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { displayDate } from '../model/dates'
import { formatTokens, metricLabels, metrics } from '../model/usage'
import type { DailyPoint, Metric } from '../model/usage'

export function UsageChart({ points, pending }: { points: readonly DailyPoint[]; pending: boolean }) {
  const [metric, setMetric] = useState<Metric>('inputTokens')
  const maximum = Math.max(1, ...points.map(point => point[metric] ?? 0))
  const step = Math.max(1, Math.ceil(points.length / 9))
  return <section className="panel activity-panel" id="activity" aria-labelledby="activity-title">
    <div className="panel-heading"><div><p className="eyebrow">CONSUMPTION OVER TIME</p><h2 id="activity-title">Daily activity</h2></div>
      <div className="chart-tabs" aria-label="Chart metric">{metrics.map(item => <button key={item} aria-pressed={metric === item} className={metric === item ? 'active' : ''} onClick={() => setMetric(item)}>{metricLabels[item]}</button>)}</div>
    </div>
    {pending ? <div className="chart-placeholder skeleton" aria-label="Loading daily chart" /> : !points.length ?
      <div className="chart-empty"><BarChart3 size={32} strokeWidth={1.3} /><strong>No observations in view</strong><p>Daily activity will appear after a successful collection with usage records.</p></div> :
      <div className="chart-shell">
        <div className="chart-scale" aria-hidden="true">{[1, .75, .5, .25, 0].map(ratio => <span key={ratio}>{formatTokens(Math.round(maximum * ratio), true)}</span>)}</div>
        <div className="chart-scroll"><div className="bar-plot" style={{ minWidth: Math.max(380, points.length * 44) }}>
          <div className="grid-lines" aria-hidden="true">{[1, 2, 3, 4, 5].map(line => <i key={line} />)}</div>
          <div className="bars">{points.map((point, index) => {
            const value = point[metric]
            return <div className="bar-column" key={point.date}>
              <button className={`bar-button ${value === null ? 'unknown' : ''}`} style={{ height: value === null ? 18 : Math.max(2, value / maximum * 210) }}
                aria-label={`${displayDate(point.date)}, ${metricLabels[metric]}: ${value === null ? 'unavailable' : formatTokens(value) + ' tokens'}`}>
                <span className="bar-tooltip"><strong>{displayDate(point.date)}</strong>{formatTokens(value)} {value === null ? 'unavailable' : 'tokens'}</span>
              </button>
              <span className="bar-date" aria-hidden="true">{index % step === 0 || index === points.length - 1 ? displayDate(point.date) : ''}</span>
            </div>
          })}</div>
        </div></div>
      </div>}
    <div className="chart-caption"><span><i className="legend-dot" />{metricLabels[metric]}</span><span>Recorded days only · Missing values stay unavailable</span></div>
  </section>
}
