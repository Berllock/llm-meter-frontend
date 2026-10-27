import type { UsagePeriod } from './usage'
export type Preset = 'today' | '7d' | '30d'

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isTimeZone(zone: string): boolean {
  if (!zone.trim()) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return true }
  catch { return false }
}

export function todayInZone(zone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find(item => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function presetPeriod(preset: Preset, zone: string, now = new Date()): UsagePeriod {
  const to = todayInZone(zone, now)
  const from = new Date(`${to}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - (preset === 'today' ? 0 : preset === '7d' ? 6 : 29))
  return { from: from.toISOString().slice(0, 10), to, zone }
}

export function validatePeriod(period: UsagePeriod): string | null {
  if (!isDate(period.from) || !isDate(period.to)) return 'Choose valid start and end dates.'
  if (period.from > period.to) return 'The start date must be on or before the end date.'
  if (!isTimeZone(period.zone)) return 'Choose a valid time zone, such as UTC or America/Sao_Paulo.'
  return null
}

export function displayDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}
