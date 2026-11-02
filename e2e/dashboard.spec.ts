import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

function envelope(params: URLSearchParams, usage: unknown[] = [], pendingSessions = 0) {
  return { from: params.get('from'), to: params.get('to'), zone: params.get('zone'), usage,
    status: pendingSessions ? 'PARTIAL' : 'COMPLETE', coverage: [{ provider: 'CODEX', observedSessions: usage.length ? 1 : 0, pendingSessions }] }
}
async function intercept(page: Page, empty = false) {
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({ json: envelope(params, empty ? [] : [{ provider: 'CODEX', date: params.get('to'), zone: params.get('zone'), inputTokens: 1200, outputTokens: 300, cachedTokens: null }]) })
  })
}

// Validates live-response rendering, unknown metrics, keyboard chart details, and query filters.
test('shows observed usage and applies an explicit period and zone', async ({ page }) => {
  await intercept(page)
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('API connected')
  await expect(page.getByRole('region', { name: 'Selected period observations' })).toContainText('1.5K')
  await expect(page.getByRole('table')).toContainText('1,200')
  await page.getByLabel('Start date').fill('2026-10-24')
  await page.getByLabel('End date').fill('2026-10-26')
  await page.getByLabel('Time zone').fill('UTC')
  const request = page.waitForRequest(request => request.url().includes('from=2026-10-24&to=2026-10-26&zone=UTC'))
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await request
  await expect(page.getByRole('table')).toContainText('Oct 26')
  await page.getByRole('button', { name: 'Cached input', exact: true }).click()
  await expect(page.getByRole('button', { name: /Oct 26, Cached input: unavailable/ })).toBeVisible()
})

// Validates the difference between empty coverage and a real zero value.
test('shows an empty period without invented zero totals', async ({ page }) => {
  await intercept(page, true)
  await page.goto('/')
  await expect(page.getByText('No recorded usage in this period')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Selected period observations' })).toContainText('—')
  await expect(page.getByRole('table')).toHaveCount(0)
})

// Validates that backend errors reveal no private detail and never masquerade as an empty successful collection.
test('reports collection failures safely and allows recovery', async ({ page }) => {
  await page.route('**/api/usage/daily/collection?*', route => route.fulfill({ status: 503, json: { detail: 'PRIVATE_SESSION_DATA' } }))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('No new result')
  await expect(page.locator('body')).not.toContainText('PRIVATE_SESSION_DATA')
  await expect(page.getByText('No recorded usage in this period')).toHaveCount(0)
  await intercept(page)
  await page.getByRole('button', { name: 'Retry collection' }).click()
  await expect(page.getByRole('status')).toHaveText('API connected')
})

// Validates that a failed background refresh clearly marks the last successful values as stale.
test('retains previous values with a stale warning after refresh fails', async ({ page }) => {
  await intercept(page)
  await page.goto('/')
  await expect(page.getByRole('table')).toContainText('1,200')
  await page.route('**/api/usage/daily/collection?*', route => route.fulfill({ status: 503 }))
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByRole('alert')).toContainText('last successful result')
  await expect(page.getByRole('table')).toContainText('1,200')
  await expect(page.getByText('STALE DATA')).toBeVisible()
})

// Validates that automatic polling runs every five seconds and can be paused without blocking manual collection.
test('polls automatically and respects the pause control', async ({ page }) => {
  await page.clock.install()
  let requests = 0
  await page.route('**/api/usage/daily/collection?*', route => { requests++; return route.fulfill({ json: envelope(new URL(route.request().url()).searchParams) }) })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('API connected')
  const before = requests
  await page.clock.runFor(5_100)
  await expect.poll(() => requests).toBeGreaterThan(before)
  await page.getByRole('checkbox', { name: /Auto-refresh/ }).uncheck()
  const paused = requests
  await page.clock.runFor(10_100)
  expect(requests).toBe(paused)
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect.poll(() => requests).toBeGreaterThan(paused)
})

// Validates that the dashboard stays within the mobile viewport while tables and charts scroll inside their own panels.
test('supports a narrow screen without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await intercept(page)
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('API connected')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true })
})

// Validates rendering at a desktop size and captures a synthetic-data visual checkpoint.
test('renders the desktop overview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    const end = new Date(params.get('to')! + 'T00:00:00Z')
    return route.fulfill({ json: envelope(params, [4200, 6200, 2100, 8800, 6500, 4100, 5600].map((inputTokens, index) => {
      const date = new Date(end)
      date.setUTCDate(date.getUTCDate() - (6 - index))
      return { provider: 'CODEX', zone: params.get('zone'), date: date.toISOString().slice(0, 10), inputTokens, outputTokens: 300 + index * 75, cachedTokens: index === 2 ? null : Math.floor(inputTokens / 2) }
    })) })
  })
  await page.goto('/')
  await expect(page.getByRole('table')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true })
})

// Validates partial observations stay visible, pending coverage is explicit, and polling replaces it once counters arrive.
test('shows partial coverage and automatically includes newly observed counters', async ({ page }) => {
  await page.clock.install()
  let pending = 3
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({ json: envelope(params, [{ provider: 'CODEX', date: params.get('to'), zone: params.get('zone'), inputTokens: pending ? 100 : 150, outputTokens: 10, cachedTokens: null }], pending) })
  })
  await page.goto('/')
  const coverage = page.getByRole('region', { name: 'Collection coverage' })
  await expect(coverage).toContainText('3 sessions are pending token counts')
  await expect(page.getByRole('status')).toHaveText('Collection incomplete')
  await expect(page.getByRole('table')).toContainText('100')
  await expect(coverage).not.toContainText('%')
  pending = 0
  await page.clock.runFor(5_100)
  await expect(coverage).toContainText('No pending sessions')
  await expect(page.getByRole('table')).toContainText('150')
  await expect(page.getByRole('status')).toHaveText('API connected')
})

// Validates pending-only data never looks like a successful zero-usage period and retains its coverage label on failure.
test('distinguishes pending-only data and stale coverage from empty observations', async ({ page }) => {
  await page.route('**/api/usage/daily/collection?*', route => route.fulfill({ json: envelope(new URL(route.request().url()).searchParams, [], 2) }))
  await page.goto('/')
  await expect(page.getByText('No observations available for this period yet')).toBeVisible()
  await expect(page.getByText('No recorded usage in this period', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Selected period observations' })).toContainText('—')
  await page.route('**/api/usage/daily/collection?*', route => route.fulfill({ status: 503 }))
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByRole('alert')).toContainText('last successful result')
  await expect(page.getByRole('region', { name: 'Collection coverage' })).toContainText('current coverage is unknown')
  await expect(page.getByText('STALE DATA', { exact: true })).toBeVisible()
})

// Validates all-agent totals, agent-scoped cards/chart/table/coverage, and isolation after one agent fails.
test('aggregates configured agents and filters without leaking another agent result', async ({ page }) => {
  let failAntigravity = false
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    const provider = params.get('provider')
    if (provider === 'ANTIGRAVITY' && failAntigravity) return route.fulfill({ status: 503 })
    const all = [
      { provider: 'CODEX', date: params.get('to'), zone: params.get('zone'), inputTokens: 100, outputTokens: 10, cachedTokens: 50 },
      { provider: 'ANTIGRAVITY', date: params.get('to'), zone: params.get('zone'), inputTokens: 200, outputTokens: 20, cachedTokens: 150 },
    ]
    const usage = provider ? all.filter(row => row.provider === provider) : all
    return route.fulfill({ json: { from: params.get('from'), to: params.get('to'), zone: params.get('zone'), status: 'COMPLETE', usage,
      coverage: usage.map(row => ({ provider: row.provider, observedSessions: 1, pendingSessions: 0 })) } })
  })
  await page.goto('/')
  const summary = page.getByRole('region', { name: 'Selected period observations' })
  const coverage = page.getByRole('region', { name: 'Collection coverage' })
  await expect(summary).toContainText('330')
  await expect(coverage).toContainText('2 sessions')
  await page.getByLabel('Agent', { exact: true }).selectOption('ANTIGRAVITY')
  await expect(summary).toContainText('220')
  await expect(page.getByRole('table')).not.toContainText('CODEX')
  await expect(coverage).toContainText('1 session')
  failAntigravity = true
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByText('STALE DATA')).toBeVisible()
  await page.getByLabel('Agent', { exact: true }).selectOption('CODEX')
  await expect(summary).toContainText('110')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('table')).not.toContainText('ANTIGRAVITY')
  await page.getByLabel('Agent', { exact: true }).selectOption('')
  await expect(summary).toContainText('330')
})
