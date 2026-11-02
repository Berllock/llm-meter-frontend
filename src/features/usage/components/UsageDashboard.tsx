import { useDesktopBackend } from '../../../desktop/useDesktopBackend'
import { useEffect, useState } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, CircleHelp, Database, HardDrive, Layers3, LayoutDashboard, RefreshCw, ShieldCheck, Zap } from 'lucide-react'
import { UsageApiError } from '../api/usage'
import { useUsage } from '../hooks/useUsage'
import { presetPeriod } from '../model/dates'
import type { Preset } from '../model/dates'
import { addTokens, dailyPoints, formatTokens, summarizeUsage } from '../model/usage'
import type { Agent, UsagePeriod } from '../model/usage'
import { UsageChart } from './UsageChart'
import { UsageFilters } from './UsageFilters'
import { UsageTable } from './UsageTable'

const initialZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function UsageDashboard() {
  const [selection, setSelection] = useState<{ preset: Preset | 'custom'; period: UsagePeriod }>({ preset: '7d', period: presetPeriod('7d', initialZone) })
  const [agent, setAgent] = useState<Agent | ''>('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [])
  const period = selection.preset === 'custom' ? selection.period : presetPeriod(selection.preset, selection.period.zone, now)
  const desktop = useDesktopBackend()
  const available = desktop.state.phase === 'ready'
  const query = useUsage({ ...period, ...(agent ? { provider: agent } : {}) }, autoRefresh, { enabled: available, generation: desktop.state.generation, refreshInBackground: !!desktop.bridge })
  const rows = query.data?.usage ?? []
  const coverage = query.data?.coverage ?? []
  const pendingSessions = coverage.reduce((sum, item) => sum + item.pendingSessions, 0)
  const observedSessions = coverage.reduce((sum, item) => sum + item.observedSessions, 0)
  const incomplete = query.data?.status === 'PARTIAL'
  const totals = summarizeUsage(rows)
  const points = dailyPoints(rows)
  const hasData = query.data !== undefined
  const pending = desktop.state.phase === 'starting' || (available && query.isPending)
  const stale = (query.isError || !available) && hasData
  const status = !available ? (desktop.state.phase === 'starting' ? 'Starting service' : 'Service unavailable') : query.isError ? (query.error instanceof UsageApiError && query.error.status === null ? 'Service unavailable' : 'Collection unavailable') : pending ? 'Connecting' : incomplete ? 'Collection incomplete' : 'API connected'
  const cards = [
    { name: 'Observed tokens', value: addTokens([totals.inputTokens, totals.outputTokens]), note: 'Input + output · cache already included', icon: Zap, featured: true },
    { name: 'Observed input tokens', value: totals.inputTokens, note: 'Prompts and context sent to a model', icon: ArrowUpRight },
    { name: 'Observed output tokens', value: totals.outputTokens, note: 'Tokens generated in responses', icon: ArrowDownLeft },
    { name: 'Observed cached input', value: totals.cachedTokens, note: 'A subset of input, never added twice', icon: Layers3 },
  ]
  const providers = [...new Set(coverage.map(row => row.provider))]
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to usage overview</a>
    <aside className="sidebar">
      <a className="brand" href="#main" aria-label="LLM Meter home"><span className="brand-icon"><Activity size={22} /></span><span>llm<span className="brand-light">meter</span><small>PERSONAL WORKSPACE</small></span></a>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation"><a className="nav-item current" href="#main" aria-current="page"><LayoutDashboard size={18} />Overview<span className="nav-dot" /></a><a className="nav-item" href="#activity"><Activity size={18} />Daily activity</a><a className="nav-item" href="#records"><Database size={18} />Daily records</a></nav>
      <div className="sidebar-spacer" />
      <a className="nav-item about-link" href="#about"><CircleHelp size={18} />About your data</a>
      <div className="local-card"><HardDrive size={18} /><strong>Local by design</strong><p>Your usage comes from session files on this device.</p><span><i />Personal workspace</span></div>
      <div className="sidebar-footer"><span className="avatar">P</span><div>Personal<small>LLM Meter · v0.1</small></div></div>
    </aside>
    <main id="main" className="main-content">
      <header className="topbar"><span className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></span><span className="local-label"><ShieldCheck size={14} /> LOCAL SESSION DATA</span></header>
      <div className="content">
        <div className="page-heading"><div><p className="eyebrow">A LITTLE CLARITY FOR YOUR AI WORK</p><h1>Your usage, in view<span>.</span></h1><p>Understand the tokens behind your conversations.</p></div>
          <div className="heading-actions"><span className={`connection ${query.isError ? 'offline' : pending ? 'waiting' : ''}`} role="status"><i />{status}</span>
            <button className="button refresh" onClick={() => void query.refetch()} disabled={!available || query.isFetching} aria-label="Refresh usage"><RefreshCw size={16} className={query.isFetching ? 'spinning' : ''} />Refresh</button>
          </div>
        </div>
        {desktop.bridge && <div className="desktop-toolbar" role="status"><span>{desktop.state.message}</span><div>
          <button className="button" onClick={() => void desktop.bridge?.chooseSessionsFolder()} disabled={desktop.state.phase === 'starting'}>Choose sessions folder</button>
          <button className="button" onClick={() => void desktop.bridge?.chooseSessionsFolder('ANTIGRAVITY')} disabled={desktop.state.phase === 'starting'}>Choose Antigravity brain folder</button>
          <button className="button" onClick={() => void desktop.bridge?.restartBackend()} disabled={desktop.state.phase === 'starting'}>Restart service</button>
        </div></div>}
        <div className="agent-filter"><label className="field"><span>Agent</span><select aria-label="Agent" value={agent} onChange={event => setAgent(event.target.value as Agent | '')}><option value="">All configured agents</option><option value="CODEX">Codex</option><option value="ANTIGRAVITY">Antigravity</option></select></label></div>
        <UsageFilters key={`${period.from}|${period.to}|${period.zone}`} period={period} preset={selection.preset}
          onPreset={preset => setSelection({ preset, period: presetPeriod(preset, period.zone) })}
          onApply={next => setSelection({ preset: 'custom', period: next })} />
        <div className="collection-meta"><span>{hasData ? `${points.length} recorded ${points.length === 1 ? 'day' : 'days'}${providers.length ? ' · ' + providers.join(', ') : ''}` : 'Waiting for a successful collection'}{stale && <strong className="stale-tag">STALE DATA</strong>}</span>
          <label className="auto-refresh"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} /><span className="toggle" aria-hidden="true" />{desktop.bridge ? 'Auto-refresh · 5s, including background' : 'Auto-refresh · 5s'}</label>
        </div>
        {available && query.isError && <div className="error-banner" role="alert"><div><strong>{stale ? 'Live collection paused. Showing the last successful result.' : 'Usage is unavailable right now.'}</strong><p>{query.error.message}</p></div><button className="button" onClick={() => void query.refetch()} disabled={!available || query.isFetching}>Retry collection</button></div>}
        {hasData && <section className={`coverage-banner ${incomplete ? 'incomplete' : ''}`} aria-label="Collection coverage" aria-live="polite">
          <strong>{incomplete ? `Collection incomplete: ${pendingSessions} ${pendingSessions === 1 ? 'session is' : 'sessions are'} pending token counts.` : 'No pending sessions in this collection.'}{stale ? ' Last successful collection; current coverage is unknown.' : ''}</strong>
          <p>{observedSessions} {observedSessions === 1 ? 'session has' : 'sessions have'} recorded counters. These counts describe the selected agents’ sources, not a percentage of tokens or coverage of this date range. Pending usage may fall outside or inside the selected period.</p>
          {incomplete && <p>Values below include only recorded observations. Pending sessions are not counted as zero and are checked again on collection.</p>}
        </section>}
        <section className="metric-grid" aria-label="Selected period observations" aria-busy={pending}>
          {cards.map(card => <article key={card.name} className={`metric-card ${card.featured ? 'featured' : ''}`}><div className="metric-label">{card.name}<card.icon size={17} aria-hidden="true" /></div>
            <div className={`metric-value ${pending ? 'skeleton metric-skeleton' : ''}`} title={formatTokens(card.value)}>{pending ? <span className="sr-only">Loading {card.name}</span> : formatTokens(card.value, true)}</div><p>{card.note}</p>
          </article>)}
        </section>
        {hasData && !rows.length && <div className="empty-banner"><Database size={20} /><div><strong>{incomplete ? 'No observations available for this period yet' : 'No recorded usage in this period'}</strong><p>{incomplete ? 'Coverage is incomplete. Pending sessions may contain usage for this period.' : 'Try another date range. An empty result does not establish zero account-wide usage.'}</p></div></div>}
        <UsageChart points={points} pending={pending} />
        {hasData && rows.length > 0 && <UsageTable rows={rows} />}
        <section id="about" className="data-note"><ShieldCheck size={20} aria-hidden="true" /><div><h2>A clear view, with honest limits.</h2><p>Usage reflects locally recorded events in the selected time zone, not a complete account-wide total. Pending sessions can make coverage incomplete. A dash means unavailable, not zero. Cached tokens are part of input usage. Cost estimates and remaining quota are not available yet.</p></div></section>
        <footer className="page-footer"><span>LLM Meter Personal <span className="footer-dot">·</span> Built for your own workflow</span><span>{query.dataUpdatedAt > 0 ? `Last successful collection ${new Date(query.dataUpdatedAt).toLocaleTimeString('en-US')}${stale ? ' · stale' : ''}` : 'No successful collection yet'}</span></footer>
      </div>
    </main>
  </div>
}
