import { useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, Globe2 } from 'lucide-react'
import { validatePeriod } from '../model/dates'
import type { Preset } from '../model/dates'
import type { UsagePeriod } from '../model/usage'

type Props = { period: UsagePeriod; preset: Preset | 'custom'; onPreset: (preset: Preset) => void; onApply: (period: UsagePeriod) => void }

export function UsageFilters({ period, preset, onPreset, onApply }: Props) {
  const [draft, setDraft] = useState(period)
  const [error, setError] = useState<string | null>(null)
  function submit(event: FormEvent) {
    event.preventDefault()
    const next = { ...draft, zone: draft.zone.trim() }
    const message = validatePeriod(next)
    setError(message)
    if (!message) onApply(next)
  }
  return <section className="filters-panel" aria-label="Usage filters">
    <div className="presets" aria-label="Date presets">
      {([['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']] as const).map(([value, label]) =>
        <button key={value} className={preset === value ? 'preset active' : 'preset'} aria-pressed={preset === value} onClick={() => onPreset(value)}>{label}</button>)}
    </div>
    <form onSubmit={submit} noValidate>
      <label className="field"><span><CalendarDays size={13} aria-hidden="true" /> From</span>
        <input aria-label="Start date" type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
      <span className="date-arrow" aria-hidden="true">→</span>
      <label className="field"><span>To</span><input aria-label="End date" type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
      <label className="field zone-field"><span><Globe2 size={13} aria-hidden="true" /> Time zone</span>
        <input aria-label="Time zone" list="time-zones" value={draft.zone} onChange={event => setDraft({ ...draft, zone: event.target.value })} />
        <datalist id="time-zones">{['UTC', 'America/Sao_Paulo', 'America/New_York', 'Europe/London', 'Asia/Tokyo'].map(zone => <option key={zone} value={zone} />)}</datalist>
      </label>
      <button type="submit" className="button apply">Apply filters</button>
    </form>
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>
}
