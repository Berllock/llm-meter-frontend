import { describe, expect, it } from 'vitest'
import { isDate, presetPeriod, todayInZone, validatePeriod } from './dates'

describe('usage dates', () => {
  // Validates strict date handling, including leap years and invalid calendar dates.
  it('accepts real ISO calendar dates only', () => {
    expect(isDate('2024-02-29')).toBe(true)
    expect(isDate('2026-02-30')).toBe(false)
    expect(isDate('26-10-25')).toBe(false)
  })
  // Validates local-day selection before UTC midnight has become local midnight.
  it('uses the selected time zone rather than the machine date', () => {
    expect(todayInZone('America/Sao_Paulo', new Date('2026-10-26T01:00:00Z'))).toBe('2026-10-25')
  })
  // Validates inclusive preset ranges across daylight saving and month boundaries.
  it('constructs seven calendar days across a daylight saving change', () => {
    expect(presetPeriod('7d', 'America/New_York', new Date('2026-11-03T12:00:00Z')))
      .toEqual({ from: '2026-10-28', to: '2026-11-03', zone: 'America/New_York' })
  })
  // Validates range ordering and unknown time zones before making an HTTP request.
  it('rejects invalid periods and accepts same-day queries', () => {
    expect(validatePeriod({ from: '2026-10-26', to: '2026-10-25', zone: 'UTC' })).toMatch(/start date/)
    expect(validatePeriod({ from: '2026-10-25', to: '2026-10-25', zone: 'Private/Invalid' })).toMatch(/time zone/)
    expect(validatePeriod({ from: '2026-10-25', to: '2026-10-25', zone: 'UTC' })).toBeNull()
  })
})
