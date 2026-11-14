import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Keeps every browser scenario isolated from local provider sources.
test.beforeEach(async ({ page }) => { await page.route('**/api/quota?*', route => route.fulfill({ json: [] })) })

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

// Validates credit-only Kiro usage is visible without contaminating token subtotals, filters, or coverage.
test('shows Kiro credits separately and labels the known token subtotal', async ({ page }) => {
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    const provider = params.get('provider')
    const all = [
      { provider: 'CODEX', date: params.get('to'), zone: params.get('zone'), inputTokens: 100, outputTokens: 10, cachedTokens: 50 },
      { provider: 'KIRO', date: params.get('to'), zone: params.get('zone'), inputTokens: null, outputTokens: null, cachedTokens: null, credits: '1.75' },
    ]
    const usage = provider ? all.filter(row => row.provider === provider) : all
    return route.fulfill({ json: { from: params.get('from'), to: params.get('to'), zone: params.get('zone'), status: 'COMPLETE', usage,
      coverage: usage.map(row => ({ provider: row.provider, observedSessions: 1, pendingSessions: 0, tokenCountsAvailable: row.provider !== 'KIRO' })) } })
  })
  await page.goto('/')
  const tokens = page.getByRole('region', { name: 'Selected period observations' })
  await expect(tokens).toContainText('Known token subtotal')
  await expect(tokens).toContainText('110')
  await expect(page.getByRole('region', { name: 'Kiro credit observations' })).toContainText('1.75')
  await expect(page.getByRole('region', { name: 'Unavailable token counts' })).toContainText('KIRO')
  await expect(page.getByRole('table')).toContainText('Credits')
  await page.getByLabel('Agent', { exact: true }).selectOption('KIRO')
  await expect(page.getByRole('table')).not.toContainText('CODEX')
  await expect(tokens).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Chart metric' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Unavailable token counts' })).toHaveCount(0)
  await expect(page.getByRole('columnheader')).toHaveText(['Date', 'Provider', 'Credits'])
  await expect(page.getByRole('heading', { name: 'Daily credit records' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Kiro credit observations' })).toContainText('1.75')
  await page.getByLabel('Agent', { exact: true }).selectOption('CODEX')
  await expect(tokens).toContainText('Observed tokens')
  await expect(tokens).toContainText('110')
  await expect(page.getByRole('region', { name: 'Kiro credit observations' })).toHaveCount(0)
})

// Validates Kiro stays credit-only while loading, after collection failure, and with an empty successful result.
test('keeps the Kiro layout credit-only across request states', async ({ page }) => {
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  let recovered = false
  await page.route('**/api/usage/daily/collection?*', async route => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('provider') !== 'KIRO') return route.fulfill({ json: envelope(params) })
    await gate
    if (!recovered) return route.fulfill({ status: 503 })
    return route.fulfill({ json: { from: params.get('from'), to: params.get('to'), zone: params.get('zone'), status: 'COMPLETE', usage: [],
      coverage: [{ provider: 'KIRO', observedSessions: 0, pendingSessions: 0, tokenCountsAvailable: false }] } })
  })
  try {
    await page.goto('/')
    await page.getByLabel('Agent', { exact: true }).selectOption('KIRO')
    const credits = page.getByRole('region', { name: 'Kiro credit observations' })
    await expect(credits).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('region', { name: 'Selected period observations' })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Chart metric' })).toHaveCount(0)
    release()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(credits).toContainText('—')
    await expect(page.getByRole('region', { name: 'Selected period observations' })).toHaveCount(0)
    recovered = true
    await page.getByRole('button', { name: 'Retry collection' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('No recorded usage in this period')).toBeVisible()
    await expect(credits).toContainText('—')
    await expect(page.getByRole('group', { name: 'Chart metric' })).toHaveCount(0)
    await expect(page.getByRole('table')).toHaveCount(0)
  } finally { release() }
})

// Validates model partitions, quota reset/freshness, configured-plan mismatch and local selection persistence.
test('shows model usage and honest plan quota observations', async ({ page }) => {
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    const row = { provider: 'CODEX', date: params.get('to'), zone: params.get('zone'), inputTokens: 100, outputTokens: 10, cachedTokens: 0 }
    return route.fulfill({ json: { ...envelope(params, [row]), modelUsage: [{ ...row, model: 'model-synthetic' }] } })
  })
  const observedAt = new Date().toISOString()
  const resetAt = new Date(Date.now() + 3600_000).toISOString()
  await page.route('**/api/quota?*', route => route.fulfill({ json: [{ provider: 'CODEX', status: 'OBSERVED', snapshot: {
    observedAt, collectedAt: observedAt, planType: 'plus', windows: [{ name: 'primary', usedPercent: 85, windowMinutes: 300, resetAt, observedAt, limitId: 'codex' }],
  } }] }))
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Codex model observations' })).toContainText('model-synthetic')
  const quota = page.getByRole('region', { name: 'Plan quota observations' })
  await expect(quota).toContainText('85% last reported used · 15% last reported remaining')
  await expect(quota).toContainText('Reported usage is close to this limit.')
  await page.getByLabel('Configured Codex plan').selectOption('pro')
  await expect(quota).toContainText('Selected plan differs from the recorded plan')
  await expect(quota).toContainText('Reported plan: plus')
  await page.reload()
  await expect(page.getByLabel('Configured Codex plan')).toHaveValue('pro')
  await page.route('**/api/quota?*', route => route.fulfill({ status: 503 }))
  await page.getByRole('button', { name: 'Refresh quota' }).click()
  await expect(quota).toContainText('current quota is unknown')
  await expect(quota.getByText('Reported usage is close to this limit.')).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('API connected')
})

// Validates projections remain attached to the reported plan and disappear after stale/error responses or agent changes.
test('shows recent-pace forecasts and invalidates stale projections', async ({ page }) => {
  await intercept(page)
  const end = Math.floor(Date.now() / 1000) * 1000
  const observedAt = new Date(end).toISOString()
  const projectedExhaustionAt = new Date(end + 720_000).toISOString()
  const forecast = { status: 'ESTIMATED', sampleCount: 3, sampleFrom: new Date(end - 240_000).toISOString(), sampleTo: observedAt,
    percentagePointsPerHour: 300, projectedExhaustionAt, earliestExhaustionAt: projectedExhaustionAt, latestExhaustionAt: projectedExhaustionAt }
  const response = [{ provider: 'CODEX', status: 'OBSERVED', snapshot: { observedAt, collectedAt: observedAt, planType: 'plus', windows: [
    { name: 'primary', usedPercent: 40, windowMinutes: 300, resetAt: new Date(end + 3600_000).toISOString(), observedAt, limitId: 'codex', forecast },
  ] } }]
  await page.route('**/api/quota?*', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('provider') === 'KIRO' ? [{ provider: 'KIRO', status: 'UNAVAILABLE', snapshot: null }] : response }))
  await page.goto('/')
  const quota = page.getByRole('region', { name: 'Plan quota observations' })
  await expect(quota).toContainText('Projected exhaustion:')
  await expect(quota).toContainText('300 percentage points/hour')
  await page.getByLabel('Configured Codex plan').selectOption('pro')
  await expect(quota).toContainText('Selected plan differs from the recorded plan')
  await expect(quota).toContainText('Reported plan: plus')
  await page.route('**/api/quota?*', route => route.fulfill({ status: 503 }))
  await page.getByRole('button', { name: 'Refresh quota' }).click()
  await expect(quota).toContainText('Forecast unavailable: current quota is unverified.')
  await expect(quota.getByText(/Projected exhaustion:/)).toHaveCount(0)
  await page.getByLabel('Agent', { exact: true }).selectOption('KIRO')
  await expect(quota.getByText(/Projected exhaustion:/)).toHaveCount(0)
})

// Validates IDE quota labels, unknown duration/excluded units and stale failure behavior without manufacturing a Codex forecast.
test('shows Antigravity IDE quota as queried evidence', async ({ page }) => {
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({ json: { from: params.get('from'), to: params.get('to'), zone: params.get('zone'), status: 'COMPLETE', usage: [], coverage: [{ provider: 'ANTIGRAVITY', observedSessions: 0, pendingSessions: 0 }] } })
  })
  const observedAt = new Date().toISOString()
  await page.route('**/api/quota?*', route => route.fulfill({ json: [{ provider: 'ANTIGRAVITY', status: 'OBSERVED', snapshot: { observedAt, collectedAt: observedAt,
    source: 'ANTIGRAVITY_IDE', planType: null, excludedWindows: 1, windows: [{ name: 'custom', usedPercent: 85, windowMinutes: null, resetAt: new Date(Date.now() + 3600_000).toISOString(), observedAt, limitId: 'synthetic-model', displayName: 'Synthetic model' }] } }] }))
  await page.goto('/')
  const quota = page.getByRole('region', { name: 'Plan quota observations' })
  await expect(quota).toContainText('Synthetic model')
  await expect(quota).toContainText('Duration not reported')
  await expect(quota).toContainText('Queried')
  await expect(quota).toContainText('1 quota buckets omitted')
  await expect(quota).toContainText('85% last reported used')
  await expect(quota.getByText(/Projected exhaustion:/)).toHaveCount(0)
  await page.route('**/api/quota?*', route => route.fulfill({ status: 503 }))
  await page.getByRole('button', { name: 'Refresh quota' }).click()
  await expect(quota).toContainText('current quota is unknown')
  await expect(quota.getByText('Reported usage is close to this limit.')).toHaveCount(0)
})

// Validates Kiro-only view renders account balance and renewal separately from observed session credits.
test('shows reported Kiro account quota without token or API cost conversion', async ({ page }) => {
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({ json: { from: params.get('from'), to: params.get('to'), zone: params.get('zone'), status: 'COMPLETE',
      usage: [{ provider: 'KIRO', date: params.get('to'), zone: params.get('zone'), inputTokens: null, outputTokens: null, cachedTokens: null, credits: '1.25' }],
      coverage: [{ provider: 'KIRO', observedSessions: 1, pendingSessions: 0, tokenCountsAvailable: false }] } })
  })
  await page.route('**/api/quota?*', route => route.fulfill({ json: [{ provider: 'KIRO', status: 'OBSERVED', snapshot: {
    observedAt: new Date().toISOString(), collectedAt: new Date().toISOString(), planType: null, source: 'KIRO_CLI', windows: [],
    creditQuota: { planName: 'Synthetic Free', renewalDate: '2099-12-01', overagesEnabled: false, allowances: [
      { kind: 'SUBSCRIPTION', name: 'Plan credits', used: '42.5', limit: '50', remaining: '7.5', expiresOn: null, daysUntilExpiry: null },
    ] },
  } }] }))
  await page.goto('/')
  await page.getByLabel('Agent', { exact: true }).selectOption('KIRO')
  const quotaPanel = page.getByRole('region', { name: 'Plan quota observations' })
  await expect(quotaPanel).toContainText('42.5 used / 50 credits · 7.5 remaining at query time')
  await expect(quotaPanel).toContainText('Reported credit usage is close to this limit.')
  await expect(quotaPanel).toContainText('2099-12-01')
  await expect(page.getByRole('region', { name: 'Kiro credit observations' })).toContainText('1.25')
  await expect(page.getByText('Known token subtotal')).toHaveCount(0)
})

// Validates healthy token/credit observations remain visible and filtering a failed agent exposes an explicit failure.
test('isolates failed agents and preserves scoped healthy observations', async ({ page }) => {
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    const provider = params.get('provider')
    const usage = [
      { provider: 'CODEX', date: params.get('to'), zone: params.get('zone'), inputTokens: 100, outputTokens: 10, cachedTokens: 50 },
      { provider: 'KIRO', date: params.get('to'), zone: params.get('zone'), inputTokens: null, outputTokens: null, cachedTokens: null, credits: '1.25' },
    ].filter(row => !provider || row.provider === provider)
    const failures = !provider || provider === 'ANTIGRAVITY' ? [{ provider: 'ANTIGRAVITY', reason: 'INVALID_SEQUENCE' }] : []
    return route.fulfill({ json: { from: params.get('from'), to: params.get('to'), zone: params.get('zone'),
      status: provider === 'ANTIGRAVITY' ? 'FAILED' : failures.length ? 'PARTIAL' : 'COMPLETE', usage,
      coverage: usage.map(row => ({ provider: row.provider, observedSessions: 1, pendingSessions: 0, tokenCountsAvailable: row.provider !== 'KIRO' })), failures } })
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Unavailable usage sources' })).toContainText('ANTIGRAVITY')
  await expect(page.getByRole('region', { name: 'Selected period observations' })).toContainText('Known token subtotal')
  await expect(page.getByRole('region', { name: 'Selected period observations' })).toContainText('110')
  await expect(page.getByRole('region', { name: 'Kiro credit observations' })).toContainText('1.25')
  await expect(page.getByRole('status')).toHaveText('Collection incomplete')
  await page.getByLabel('Agent', { exact: true }).selectOption('ANTIGRAVITY')
  await expect(page.getByRole('region', { name: 'Unavailable usage sources' })).toContainText('failed for every selected source')
  await expect(page.getByRole('status')).toHaveText('Collection unavailable')
  await expect(page.getByText('No recorded usage in this period')).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Chart metric' })).toHaveCount(0)
  await page.getByLabel('Agent', { exact: true }).selectOption('CODEX')
  await expect(page.getByRole('region', { name: 'Unavailable usage sources' })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('API connected')
  await expect(page.getByRole('table')).toContainText('CODEX')
})

// Validates failed refreshes remove a source's previous values and all-source failure recovers through manual retry.
test('replaces old source values on partial failure and recovers after all sources fail', async ({ page }) => {
  let mode: 'healthy' | 'partial' | 'failed' = 'healthy'
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    const all = [
      { provider: 'CODEX', date: params.get('to'), zone: params.get('zone'), inputTokens: 100, outputTokens: 10, cachedTokens: 50 },
      { provider: 'ANTIGRAVITY', date: params.get('to'), zone: params.get('zone'), inputTokens: 200, outputTokens: 20, cachedTokens: 80 },
    ]
    const usage = all.filter(row => mode === 'healthy' || mode === 'partial' && row.provider === 'ANTIGRAVITY')
    const failures = all.filter(row => !usage.includes(row)).map(row => ({ provider: row.provider, reason: 'READ_FAILURE' }))
    return route.fulfill({ json: { from: params.get('from'), to: params.get('to'), zone: params.get('zone'),
      status: mode === 'failed' ? 'FAILED' : mode === 'partial' ? 'PARTIAL' : 'COMPLETE', usage, failures,
      coverage: usage.map(row => ({ provider: row.provider, observedSessions: 1, pendingSessions: 0 })) } })
  })
  await page.goto('/')
  await expect(page.getByRole('table')).toContainText('CODEX')
  await page.getByRole('checkbox', { name: /Auto-refresh/ }).uncheck()
  mode = 'partial'
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByRole('region', { name: 'Unavailable usage sources' })).toContainText('CODEX')
  await expect(page.getByRole('table')).not.toContainText('CODEX')
  await expect(page.getByRole('table')).toContainText('ANTIGRAVITY')
  await expect(page.getByRole('region', { name: 'Selected period observations' })).toContainText('220')
  mode = 'failed'
  await page.getByRole('button', { name: 'Retry sources' }).click()
  await expect(page.getByRole('region', { name: 'Unavailable usage sources' })).toContainText('failed for every selected source')
  await expect(page.getByRole('region', { name: 'Collection coverage' })).toContainText('coverage is unavailable')
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByText('No recorded usage in this period')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Selected period observations' })).toContainText('—')
  mode = 'healthy'
  await page.getByRole('button', { name: 'Retry sources' }).click()
  await expect(page.getByRole('region', { name: 'Unavailable usage sources' })).toHaveCount(0)
  await expect(page.getByRole('table')).toContainText('CODEX')
  await expect(page.getByRole('status')).toHaveText('API connected')
})

// Validates saved cycles stay reviewable when current quota fails, with provider-scoped exact credit history and lazy reads.
test('shows saved quota cycles independently from live quota and selected agent', async ({ page }) => {
  await page.route('**/api/usage/daily/collection?*', route => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('provider') === 'KIRO') return route.fulfill({ json: { from: params.get('from'), to: params.get('to'), zone: params.get('zone'),
      status: 'COMPLETE', usage: [], coverage: [{ provider: 'KIRO', observedSessions: 0, pendingSessions: 0, tokenCountsAvailable: false }] } })
    return route.fulfill({ json: envelope(params) })
  })
  await page.route('**/api/quota?*', route => route.fulfill({ json: [{ provider: new URL(route.request().url()).searchParams.get('provider') ?? 'CODEX', status: 'ERROR', snapshot: null }] }))
  let historyReads = 0
  await page.route('**/api/quota/history?*', route => {
    historyReads++
    const provider = new URL(route.request().url()).searchParams.get('provider')
    const observations = provider === 'KIRO' ? [{ id: 'c'.repeat(64), savedAt: '2026-11-02T12:01:00Z', accountVerified: false,
      snapshot: { provider: 'KIRO', source: 'KIRO_CLI', observedAt: '2026-11-02T12:00:00Z', collectedAt: '2026-11-02T12:01:00Z', planType: null, windows: [],
        creditQuota: { planName: 'Synthetic Free', renewalDate: '2026-12-01', overagesEnabled: false,
          allowances: [{ kind: 'SUBSCRIPTION', name: 'Plan credits', used: '12.123456789012345678', limit: '50', remaining: '37.876543210987654322', expiresOn: null, daysUntilExpiry: null }] } } }]
      : [2, 1].map(day => ({ id: (day === 2 ? 'b' : 'a').repeat(64), savedAt: `2026-11-0${day}T12:01:00Z`, accountVerified: false,
        snapshot: { provider: 'CODEX', observedAt: `2026-11-0${day}T12:00:00Z`, collectedAt: `2026-11-0${day}T12:01:00Z`, planType: 'plus',
          windows: [{ name: 'primary', usedPercent: day * 20, windowMinutes: 300, resetAt: `2026-11-0${day}T16:00:00Z`, observedAt: `2026-11-0${day}T12:00:00Z`, limitId: 'codex' }] } }))
    return route.fulfill({ json: { status: 'READY', retentionDays: 30, observations, failures: [] } })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('API connected')
  expect(historyReads).toBe(0)
  const panel = page.getByRole('region', { name: 'Saved quota history' })
  await panel.getByText('Saved quota observations', { exact: true }).click()
  await expect(panel.locator('ol > li')).toHaveCount(2)
  await expect(panel).toContainText('not a current balance')
  await expect(panel).toContainText('Account identity is unverified')
  await panel.locator('ol summary').first().click()
  await expect(panel).toContainText('40% used at observation')
  await expect(panel.getByRole('progressbar')).toHaveCount(0)
  await page.getByLabel('Agent', { exact: true }).selectOption('KIRO')
  await expect(panel.locator('ol > li')).toHaveCount(1)
  await panel.locator('ol summary').first().click()
  await expect(panel).toContainText('37.876543210987654322 remaining at observation')
  await expect(panel).toContainText('2026-12-01')
  await expect(panel).not.toContainText('40% used at observation')
})

// Validates archive errors remain separate from live quota and never appear as an empty successful history.
test('keeps current quota available when saved history cannot be read', async ({ page }) => {
  await intercept(page)
  const observedAt = new Date().toISOString()
  await page.route('**/api/quota?*', route => route.fulfill({ json: [{ provider: 'CODEX', status: 'OBSERVED', snapshot: {
    observedAt, collectedAt: observedAt, planType: 'plus', windows: [{ name: 'primary', usedPercent: 20, windowMinutes: 300,
      resetAt: new Date(Date.now() + 3600_000).toISOString(), observedAt, limitId: 'codex' }],
  } }] }))
  await page.route('**/api/quota/history?*', route => route.fulfill({ json: { status: 'ERROR', retentionDays: 30, observations: [], failures: ['CODEX'] } }))
  await page.goto('/')
  const live = page.getByRole('region', { name: 'Plan quota observations' })
  await expect(live).toContainText('20% last reported used')
  const panel = page.getByRole('region', { name: 'Saved quota history' })
  await panel.getByText('Saved quota observations', { exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('History could not be read or saved for CODEX')
  await expect(panel).not.toContainText('No saved quota observations')
  await expect(live).toContainText('20% last reported used')
  await page.route('**/api/quota/history?*', route => route.fulfill({ status: 503, body: 'PRIVATE_HISTORY_PATH' }))
  await panel.getByRole('button', { name: 'Refresh saved history' }).click()
  await expect(panel.getByText(/Saved history could not be refreshed/)).toBeVisible()
  await expect(panel).not.toContainText('PRIVATE_HISTORY_PATH')
  await expect(live).toContainText('20% last reported used')
})
