import { _electron as electron, expect } from '@playwright/test'
import { mkdtemp, mkdir, copyFile, appendFile, writeFile, rm, readFile, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = await mkdtemp(join(tmpdir(), 'meter-electron-test-'))
const sessions = join(root, 'sessions')
await mkdir(sessions)
await copyFile(join(project, 'e2e/fixtures/desktop-session.jsonl'), join(sessions, 'sample.jsonl'))
const packaged = process.argv.includes('--packaged')
const executablePath = process.env.LLM_METER_PACKAGED_EXECUTABLE || join(project, 'release/linux-unpacked/llm-meter-personal')
const brain = join(root, 'brain')
await mkdir(brain)
const settings = join(root, 'settings')
await mkdir(settings)
await writeFile(join(settings, 'settings.json'), JSON.stringify({ sources: { CODEX: sessions, ANTIGRAVITY: brain } }))
const environment = { ...process.env, LLM_METER_USER_DATA_DIR: settings, LLM_METER_SESSIONS_DIRECTORY: sessions, LLM_METER_ANTIGRAVITY_BRAIN_DIRECTORY: brain, LLM_METER_DESKTOP_HIDE_WINDOW: '1' }
if (packaged) Object.assign(environment, { PATH: '/nonexistent-build-tools', JAVA_HOME: '/nonexistent-jdk', LLM_METER_JAVA: '/nonexistent-java', JAVA_TOOL_OPTIONS: '--invalid-host-java-option', _JAVA_OPTIONS: '--invalid-host-java-option', JDK_JAVA_OPTIONS: '--invalid-host-java-option' })
const launch = () => electron.launch({ ...(packaged ? { executablePath, args: [] } : { args: [project] }), env: environment, timeout: 30_000 })
let application
async function ownedJavaProcesses() {
  if (process.platform !== 'linux') return []
  const entries = (await readdir('/proc')).filter(entry => /^\d+$/.test(entry))
  const matches = await Promise.all(entries.map(async entry => {
    const args = await readFile(`/proc/${entry}/cmdline`).catch(() => Buffer.alloc(0))
    return args.toString().split('\0').some(value => value === `--llm-meter.codex.sessions-directory=${sessions}` || value === `--llm-meter.codex.sessions-directory=${join(root, 'empty-sessions')}`) ? Number(entry) : null
  }))
  return matches.filter(pid => pid !== null)
}
try {
  // Validates real Java startup, isolated renderer access, observed data, restart, and owned-process cleanup.
  application = await launch()
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), packaged)
  const page = await application.firstWindow()
  await expect.poll(async () => (await page.evaluate(() => window.llmMeter.getBackendState())).phase, { timeout: 60_000 }).toBe('ready')
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined')
  const state = await page.evaluate(() => window.llmMeter.getBackendState())
  const originalChildren = await ownedJavaProcesses()
  if (process.platform === 'linux') {
    assert.equal(originalChildren.length, 1)
    if (packaged) {
      const { readlink } = await import('node:fs/promises')
      assert.equal(await readlink(`/proc/${originalChildren[0]}/exe`), join(dirname(executablePath), 'resources/runtime/bin/java'))
    }
  }
  const result = await page.evaluate(() => window.llmMeter.readDailyUsage({ from: '2026-10-20', to: '2026-10-30', zone: 'UTC' }, crypto.randomUUID()))
  assert.equal(result.status, 200)
  result.body.coverage.sort((a, b) => a.provider.localeCompare(b.provider))
  assert.deepEqual(result.body, { from: '2026-10-20', to: '2026-10-30', zone: 'UTC', status: 'COMPLETE', coverage: [{ provider: 'ANTIGRAVITY', observedSessions: 0, pendingSessions: 0 }, { provider: 'CODEX', observedSessions: 1, pendingSessions: 0 }], usage: [{ provider: 'CODEX', date: '2026-10-25', zone: 'UTC', inputTokens: 160, outputTokens: 16, cachedTokens: 80 }] })
  await page.getByLabel('Start date').fill('2026-10-20')
  await page.getByLabel('End date').fill('2026-10-30')
  await page.getByLabel('Time zone').fill('UTC')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByRole('table')).toBeVisible()
  // Validates actual metric controls and appended source observations without manually refreshing.
  await page.getByRole('button', { name: 'Output tokens', exact: true }).click()
  await expect(page.getByText('Output tokens · 16 observed tokens')).toBeVisible()
  await page.getByRole('button', { name: 'Cached input', exact: true }).click()
  await expect(page.getByText('Cached input · 80 observed tokens')).toBeVisible()
  await page.getByRole('button', { name: 'Input tokens', exact: true }).click()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
  await appendFile(join(sessions, 'sample.jsonl'), JSON.stringify({ ordinal: 5, timestamp: '2026-10-27T12:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 200, output_tokens: 20, cached_input_tokens: 100 }, last_token_usage: { input_tokens: 40, output_tokens: 4, cached_input_tokens: 20 } } } }) + '\n')
  await expect(page.getByRole('table')).toContainText('Oct 27', { timeout: 15_000 })
  await expect(page.getByText('Input tokens · 200 observed tokens')).toHaveCount(1)
  // Validates pending sessions keep observations visible and automatically become observed when counters arrive.
  await writeFile(join(sessions, 'pending.jsonl'), JSON.stringify({ ordinal: 0, type: 'session_meta', payload: { id: 'synthetic-pending', history_mode: 'paginated' } }) + '\n')
  const coverage = page.getByRole('region', { name: 'Collection coverage' })
  await expect(coverage).toContainText('1 session is pending token counts', { timeout: 15_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Input tokens · 200 observed tokens')).toHaveCount(1)
  await appendFile(join(sessions, 'pending.jsonl'), JSON.stringify({ ordinal: 1, timestamp: '2026-10-28T12:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 50, output_tokens: 5, cached_input_tokens: 10 }, last_token_usage: { input_tokens: 50, output_tokens: 5, cached_input_tokens: 10 } } } }) + '\n')
  await expect(coverage).toContainText('No pending sessions', { timeout: 15_000 })
  await expect(page.getByText('Input tokens · 250 observed tokens')).toHaveCount(1)
  // Validates unsafe data still blocks new results and keeps the last successful observations visibly stale.
  await writeFile(join(sessions, 'invalid.jsonl'), '{')
  await expect(page.getByRole('alert')).toContainText('No new result', { timeout: 15_000 })
  await expect(page.getByText('Input tokens · 250 observed tokens')).toHaveCount(1)
  await expect(coverage).toContainText('current coverage is unknown')
  await expect(page.getByText('STALE DATA', { exact: true })).toHaveCount(1)
  await rm(join(sessions, 'invalid.jsonl'))
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 15_000 })
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
  await page.getByLabel('Start date').fill('2026-10-27')
  await page.getByLabel('End date').fill('2026-10-27')
  await expect(page.getByLabel('Start date')).toHaveValue('2026-10-27')
  await expect(page.getByLabel('End date')).toHaveValue('2026-10-27')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText('Input tokens · 40 observed tokens')).toBeVisible()
  await page.getByRole('button', { name: 'Restart service' }).click()
  await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.generation !== state.generation }, { timeout: 60_000 }).toBe(true)
  await expect(page.getByRole('table')).toBeVisible()
  const restarted = await ownedJavaProcesses()
  if (process.platform === 'linux') { assert.equal(restarted.length, 1); assert.notEqual(restarted[0], originalChildren[0]) }
  // Validates a second agent enters polling once, uses cache-inclusive input, and remains independently filterable through IPC.
  const antigravityLogs = join(brain, 'synthetic-conversation', '.system_generated', 'logs')
  await mkdir(antigravityLogs, { recursive: true })
  const antigravityTranscript = join(antigravityLogs, 'transcript_full.jsonl')
  const antigravityRows = [
    { step_index: 0, type: 'USER_INPUT', source: 'USER_EXPLICIT', status: 'DONE', created_at: '2026-10-27T12:00:00Z' },
    { step_index: 1, type: 'PLANNER_RESPONSE', source: 'MODEL', status: 'DONE', created_at: '2026-10-27T12:01:00Z', input_tokens: 20, cache_read_tokens: 80, output_tokens: 10 },
  ].map(value => JSON.stringify(value)).join('\n') + '\n'
  await writeFile(antigravityTranscript, antigravityRows)
  await writeFile(join(antigravityLogs, 'transcript.jsonl'), antigravityRows)
  await expect(page.getByText('Input tokens · 140 observed tokens')).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Agent', { exact: true }).selectOption('ANTIGRAVITY')
  await expect(page.getByText('Input tokens · 100 observed tokens')).toBeVisible()
  const selectedAgent = await page.evaluate(() => window.llmMeter.readDailyUsage({ from: '2026-10-27', to: '2026-10-27', zone: 'UTC', provider: 'ANTIGRAVITY' }, crypto.randomUUID()))
  assert.equal(selectedAgent.status, 200)
  assert.equal(selectedAgent.body.usage.length, 1)
  assert.equal(selectedAgent.body.coverage[0].provider, 'ANTIGRAVITY')
  await page.getByLabel('Agent', { exact: true }).selectOption('CODEX')
  await expect(page.getByText('Input tokens · 40 observed tokens')).toBeVisible()
  await writeFile(antigravityTranscript, '{')
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByLabel('Agent', { exact: true }).selectOption('')
  await expect(page.getByRole('alert')).toContainText('No new result', { timeout: 15_000 })
  await rm(join(brain, 'synthetic-conversation'), { recursive: true })
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 15_000 })
  // Validates the Antigravity chooser updates its own setting while preserving the configured Codex source.
  const beforeAntigravitySelection = await page.evaluate(() => window.llmMeter.getBackendState())
  await application.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
  }, brain)
  await page.getByRole('button', { name: 'Choose Antigravity brain folder' }).click()
  await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.generation !== beforeAntigravitySelection.generation }, { timeout: 60_000 }).toBe(true)
  assert.deepEqual(JSON.parse(await readFile(join(settings, 'settings.json'), 'utf8')), { sources: { CODEX: sessions, ANTIGRAVITY: brain } })
  const empty = join(root, 'empty-sessions')
  await mkdir(empty)
  const beforeSelection = await page.evaluate(() => window.llmMeter.getBackendState())
  // Stub only the native chooser response while exercising the real IPC, settings, and restart path.
  await application.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
  }, empty)
  await page.getByRole('button', { name: 'Choose sessions folder' }).click()
  await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.generation !== beforeSelection.generation }, { timeout: 60_000 }).toBe(true)
  await expect(page.getByText('No recorded usage in this period')).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  assert.deepEqual(JSON.parse(await readFile(join(root, 'settings/settings.json'), 'utf8')), { sources: { CODEX: empty, ANTIGRAVITY: brain } })
  await application.close(); application = undefined
  await expect.poll(ownedJavaProcesses, { timeout: 10_000 }).toEqual([])
  {
    // Validates both independently selected source folders survive a complete application relaunch.
    delete environment.LLM_METER_SESSIONS_DIRECTORY
    delete environment.LLM_METER_ANTIGRAVITY_BRAIN_DIRECTORY
    application = await launch()
    const reopened = await application.firstWindow()
    await expect.poll(async () => (await reopened.evaluate(() => window.llmMeter.getBackendState())).phase, { timeout: 60_000 }).toBe('ready')
    await expect(reopened.getByText('No recorded usage in this period')).toBeVisible()
    await application.close(); application = undefined
    await expect.poll(ownedJavaProcesses, { timeout: 10_000 }).toEqual([])
  }
  console.log('Desktop integration passed: both agents, normalized totals, provider/date/metric filters, background updates, safe failure isolation, per-agent settings, relaunch, and owned Java cleanup.')
} finally {
  if (application) await application.close()
  await rm(root, { recursive: true, force: true })
}
