import { _electron as electron, expect } from '@playwright/test'
import { mkdtemp, mkdir, copyFile, appendFile, writeFile, rm, readFile, readdir, chmod } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = await mkdtemp(join(tmpdir(), 'meter-electron-test-'))
const sessions = join(root, 'sessions')
await mkdir(sessions)
await copyFile(join(project, 'e2e/fixtures/desktop-session.jsonl'), join(sessions, 'sample.jsonl'))
const packaged = process.argv.includes('--packaged')
const executablePath = process.env.LLM_METER_PACKAGED_EXECUTABLE || join(project, 'release/linux-unpacked/llm-meter-personal')
const brain = join(root, 'brain')
await mkdir(brain)
const kiro = join(root, 'kiro')
await mkdir(kiro)
const settings = join(root, 'settings')
await mkdir(settings)
await writeFile(join(settings, 'settings.json'), JSON.stringify({ sources: { CODEX: sessions, ANTIGRAVITY: brain, KIRO: kiro } }))
const environment = { ...process.env, LLM_METER_USER_DATA_DIR: settings, LLM_METER_SESSIONS_DIRECTORY: sessions, LLM_METER_ANTIGRAVITY_BRAIN_DIRECTORY: brain, LLM_METER_KIRO_SESSIONS_DIRECTORY: kiro, LLM_METER_DESKTOP_HIDE_WINDOW: '1' }
if (packaged) Object.assign(environment, { PATH: '/nonexistent-build-tools', JAVA_HOME: '/nonexistent-jdk', LLM_METER_JAVA: '/nonexistent-java', JAVA_TOOL_OPTIONS: '--invalid-host-java-option', _JAVA_OPTIONS: '--invalid-host-java-option', JDK_JAVA_OPTIONS: '--invalid-host-java-option' })
const launch = () => electron.launch({ ...(packaged ? { executablePath, args: [] } : { args: [project] }), env: environment, timeout: 30_000 })
let application
let ideHub
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
  if (!packaged) {
    // A synthetic ACP executable isolates account-quota checks from all real Kiro authentication and sessions.
    const fakeKiro = join(root, 'kiro-cli')
    await writeFile(fakeKiro, `#!/usr/bin/python3
import json,sys,os,datetime
assert sys.argv[1:]==['acp','--agent-engine','v3','--auth-method','cli']
a=json.loads(input());assert a['method']=='initialize'
print(json.dumps({'jsonrpc':'2.0','id':1,'result':{'protocolVersion':1}}),flush=True)
b=json.loads(input());assert b['method']=='_kiro/account/getUsage'
with open(os.path.join(os.path.dirname(__file__),'kiro-calls'),'a') as f:f.write('query\\n')
renewal=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=30)).date().isoformat()
print(json.dumps({'jsonrpc':'2.0','id':2,'result':{'success':True,'data':{'planName':'Synthetic Free','billingCycleReset':renewal,'overagesEnabled':False,'usageBreakdowns':[{'resourceType':'CREDIT','hasLimit':True,'used':42.5,'limit':50}],'bonusCredits':[],'addOnCredits':[]}}}),flush=True)
`)
    await chmod(fakeKiro, 0o700)
    environment.LLM_METER_KIRO_CLI_EXECUTABLE = fakeKiro
    // Isolate IDE discovery to a fake same-user agy process; never connect to an existing real IDE hub.
    const executable = join(root, 'agy')
    await copyFile(process.execPath, executable)
    await chmod(executable, 0o700)
    const reservation = createServer()
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
    const hubPort = reservation.address().port
    await new Promise(resolve => reservation.close(resolve))
    await writeFile(join(root, 'fake-ide.cjs'), `
      const http = require('node:http'), fs = require('node:fs'), path = require('node:path')
      const root = path.dirname(__filename)
      const arg = name => process.argv.find(value => value.startsWith(name + '='))?.split('=').slice(1).join('=')
      const server = http.createServer((req, res) => {
        if (req.method !== 'POST' || req.url !== '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary' || req.headers['x-codeium-csrf-token'] !== 'SYNTHETIC_IDE_TEST_TOKEN') { res.writeHead(403).end(); return }
        fs.appendFileSync(path.join(root, 'ide-calls'), 'query\\n')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ response: { groups: [{ buckets: [{ bucketId: 'synthetic-model', displayName: 'Synthetic IDE model', window: 'weekly', remainingFraction: 0.6, resetTime: new Date(Date.now() + 7200000).toISOString() }] }] } }))
      })
      server.listen(Number(arg('--hub-port')), '127.0.0.1', () => fs.writeFileSync(path.join(root, 'ide-ready'), 'ready'))
    `)
    ideHub = spawn(executable, [join(root, 'fake-ide.cjs'), '--hub', '--app_data_dir=antigravity', `--hub-port=${hubPort}`, '--csrf_token=SYNTHETIC_IDE_TEST_TOKEN'], { stdio: 'ignore' })
    await expect.poll(async () => readFile(join(root, 'ide-ready'), 'utf8').catch(() => ''), { timeout: 10_000 }).toBe('ready')
    environment.LLM_METER_ANTIGRAVITY_IDE_HUB_PID = String(ideHub.pid)
  }
  // Validates real Java startup, isolated renderer access, observed data, restart, and owned-process cleanup.
  application = await launch()
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), packaged)
  let page = await application.firstWindow()
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
  assert.deepEqual(result.body, { from: '2026-10-20', to: '2026-10-30', zone: 'UTC', status: 'COMPLETE', coverage: [{ provider: 'ANTIGRAVITY', observedSessions: 0, pendingSessions: 0, tokenCountsAvailable: true }, { provider: 'CODEX', observedSessions: 1, pendingSessions: 0, tokenCountsAvailable: true }, { provider: 'KIRO', observedSessions: 0, pendingSessions: 0, tokenCountsAvailable: false }], usage: [{ provider: 'CODEX', date: '2026-10-25', zone: 'UTC', inputTokens: 160, outputTokens: 16, cachedTokens: 80 }], modelUsage: [{ provider: 'CODEX', date: '2026-10-25', zone: 'UTC', model: 'model-synthetic', inputTokens: 160, outputTokens: 16, cachedTokens: 80 }] })
  // Validates the quota IPC contract independently from the calendar, with historical resets kept explicit.
  const quota = await page.evaluate(() => window.llmMeter.readQuota('CODEX', crypto.randomUUID()))
  assert.equal(quota.status, 200)
  assert.equal(quota.body.length, 1)
  assert.equal(quota.body[0].status, 'OBSERVED')
  assert.equal(quota.body[0].snapshot.planType, 'plus')
  assert.equal(quota.body[0].snapshot.limit, null)
  assert.equal(quota.body[0].snapshot.windows[0].usedPercent, 85)
  // Validate durable quota storage and repeated-log deduplication through the authenticated archive IPC.
  const savedQuota = await page.evaluate(() => window.llmMeter.readQuotaHistory('CODEX', crypto.randomUUID()))
  assert.equal(savedQuota.status, 200)
  assert.equal(savedQuota.body.status, 'READY')
  assert.equal(savedQuota.body.observations.length, 1)
  assert.equal(savedQuota.body.observations[0].accountVerified, false)
  assert.equal(savedQuota.body.observations[0].snapshot.windows[0].forecast, undefined)
  await page.evaluate(() => window.llmMeter.readQuota('CODEX', crypto.randomUUID()))
  assert.equal((await page.evaluate(() => window.llmMeter.readQuotaHistory('CODEX', crypto.randomUUID()))).body.observations.length, 1)
  assert.equal((await page.evaluate(() => window.llmMeter.readQuotaHistory('../private', crypto.randomUUID()))).status, 400)

  assert.equal((await page.evaluate(() => window.llmMeter.readQuota('../private', crypto.randomUUID()))).status, 400)
  await page.getByLabel('Start date').fill('2026-10-20')
  await page.getByLabel('End date').fill('2026-10-30')
  await page.getByLabel('Time zone').fill('UTC')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.locator('#records table')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Codex model observations' })).toContainText('model-synthetic')
  await expect(page.getByRole('region', { name: 'Plan quota observations' })).toContainText('Reset time has passed; current remaining quota is unknown.')
  // Validates actual metric controls and appended source observations without manually refreshing.
  await page.getByRole('button', { name: 'Output tokens', exact: true }).click()
  await expect(page.getByText('Output tokens · 16 observed tokens')).toBeVisible()
  await page.getByRole('button', { name: 'Cached input', exact: true }).click()
  await expect(page.getByText('Cached input · 80 observed tokens')).toBeVisible()
  await page.getByRole('button', { name: 'Input tokens', exact: true }).click()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
  await appendFile(join(sessions, 'sample.jsonl'), JSON.stringify({ ordinal: 5, timestamp: '2026-10-27T12:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 200, output_tokens: 20, cached_input_tokens: 100 }, last_token_usage: { input_tokens: 40, output_tokens: 4, cached_input_tokens: 20 } } } }) + '\n')
  await expect(page.locator('#records table')).toContainText('Oct 27', { timeout: 15_000 })
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
  // Validates a failed source is explicit and stale values from that source are removed from fresh subtotals.
  await writeFile(join(sessions, 'invalid.jsonl'), '{')
  await expect(page.getByRole('region', { name: 'Unavailable usage sources' })).toContainText('CODEX', { timeout: 15_000 })
  await expect(page.getByText('Input tokens · 250 observed tokens')).toHaveCount(0)
  await expect(coverage).toContainText('source coverage is unavailable for failed agents')
  await expect(page.getByText('STALE DATA', { exact: true })).toHaveCount(0)
  const failedSource = await page.evaluate(() => window.llmMeter.readDailyUsage({ from: '2026-10-20', to: '2026-10-30', zone: 'UTC', provider: 'CODEX' }, crypto.randomUUID()))
  assert.equal(failedSource.status, 200)
  assert.equal(failedSource.body.status, 'FAILED')
  assert.deepEqual(failedSource.body.coverage, [])
  assert.deepEqual(failedSource.body.usage, [])
  assert.equal(failedSource.body.failures[0].provider, 'CODEX')
  await rm(join(sessions, 'invalid.jsonl'))
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 15_000 })
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
  await page.getByLabel('Start date').fill('2026-10-27')
  await page.getByLabel('End date').fill('2026-10-27')
  await expect(page.getByLabel('Start date')).toHaveValue('2026-10-27')
  await expect(page.getByLabel('End date')).toHaveValue('2026-10-27')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.locator('#records table').locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText('Input tokens · 40 observed tokens')).toBeVisible()
  await page.getByRole('button', { name: 'Restart service' }).click()
  await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.generation !== state.generation }, { timeout: 60_000 }).toBe(true)
  await expect(page.locator('#records table')).toBeVisible()
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
  await expect(page.getByRole('region', { name: 'Unavailable usage sources' })).toContainText('ANTIGRAVITY', { timeout: 15_000 })
  await expect(page.getByText('Input tokens · 40 observed tokens')).toBeVisible()
  const isolated = await page.evaluate(() => window.llmMeter.readDailyUsage({ from: '2026-10-27', to: '2026-10-27', zone: 'UTC' }, crypto.randomUUID()))
  assert.equal(isolated.body.status, 'PARTIAL')
  assert.equal(isolated.body.failures[0].provider, 'ANTIGRAVITY')
  assert.equal(isolated.body.coverage.some(row => row.provider === 'ANTIGRAVITY'), false)
  assert.equal(isolated.body.usage.some(row => row.provider === 'CODEX'), true)
  await rm(join(brain, 'synthetic-conversation'), { recursive: true })
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 15_000 })
  // Validates Kiro contributes recorded credits without fabricated tokens and remains isolated by agent.
  const kiroSession = join(kiro, 'synthetic-kiro')
  await mkdir(kiroSession)
  await writeFile(join(kiroSession, 'session.json'), JSON.stringify({ schemaVersion: '1.0.0', dataModelVersion: 1, id: 'synthetic-kiro' }))
  await writeFile(join(kiroSession, 'messages.jsonl'), JSON.stringify({ id: 'credit-event', timestamp: '2026-10-27T12:05:00Z', payload: { type: 'usage_summary', executionId: 'credit-execution', status: 'success', promptTurnSummaries: [{ unit: 'credit', usage: 1.75 }] } }) + '\n')
  await expect(page.getByRole('region', { name: 'Kiro credit observations' })).toContainText('1.75', { timeout: 15_000 })
  await expect(page.getByText('Input tokens · 40 observed tokens')).toBeVisible()
  await page.getByLabel('Agent', { exact: true }).selectOption('KIRO')
  await expect(page.locator('#records table')).not.toContainText('CODEX')
  await expect(page.getByRole('region', { name: 'Selected period observations' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Chart metric' })).toHaveCount(0)
  await expect(page.getByRole('columnheader')).toHaveText(['Date', 'Provider', 'Credits'])
  const creditResult = await page.evaluate(() => window.llmMeter.readDailyUsage({ from: '2026-10-27', to: '2026-10-27', zone: 'UTC', provider: 'KIRO' }, crypto.randomUUID()))
  assert.equal(creditResult.status, 200)
  assert.equal(creditResult.body.usage[0].credits, '1.75')
  assert.equal(creditResult.body.usage[0].inputTokens, null)
  assert.equal(creditResult.body.coverage[0].tokenCountsAvailable, false)
  await page.getByLabel('Agent', { exact: true }).selectOption('CODEX')
  await writeFile(join(kiroSession, 'messages.jsonl'), '{')
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByLabel('Agent', { exact: true }).selectOption('')
  await expect(page.getByRole('region', { name: 'Unavailable usage sources' })).toContainText('KIRO', { timeout: 15_000 })
  await expect(page.getByText('Input tokens · 40 observed tokens')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Kiro credit observations' })).toContainText('—')
  await rm(kiroSession, { recursive: true })
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 15_000 })
  // Validates real source history produces a forecast through Java, authenticated IPC, parsing and React.
  const forecastNow = Math.floor(Date.now() / 1000)
  const zeroCounts = { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 }
  const forecastRows = [{ ordinal: 0, type: 'session_meta', payload: { id: 'synthetic-forecast', creator_account_id: 'synthetic-account', history_mode: 'paginated' } },
    ...[20, 30, 40].map((percent, index) => ({ ordinal: index + 1, timestamp: new Date((forecastNow - 240 + index * 120) * 1000).toISOString(),
      type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: zeroCounts, last_token_usage: zeroCounts },
        rate_limits: { plan_type: 'plus', limit_id: 'codex', primary: { used_percent: percent, window_minutes: 300, resets_at: forecastNow + 3600 } } } })),
  ]
  await writeFile(join(sessions, 'forecast.jsonl'), forecastRows.map(row => JSON.stringify(row)).join('\n') + '\n')
  const forecastPanel = page.getByRole('region', { name: 'Plan quota observations' })
  await expect(forecastPanel).toContainText('Recent-pace scenario', { timeout: 15_000 })
  await expect(forecastPanel).toContainText('300 percentage points/hour')
  const forecastResult = await page.evaluate(() => window.llmMeter.readQuota('CODEX', crypto.randomUUID()))
  assert.equal(forecastResult.status, 200)
  assert.equal(forecastResult.body[0].snapshot.windows[0].forecast.status, 'ESTIMATED')
  assert.equal(forecastResult.body[0].snapshot.windows[0].forecast.sampleCount, 3)
  assert.equal(JSON.stringify(forecastResult.body).includes('synthetic-account'), false)
  // Native-format account metadata reaches comparison context, never raw HTTP fields or private identity in the archive.
  const identifiedHistory = await page.evaluate(() => window.llmMeter.readQuotaHistory('CODEX', crypto.randomUUID()))
  const identifiedEntry = identifiedHistory.body.observations.find(entry => entry.accountVerified)
  assert.ok(identifiedEntry)
  assert.equal(identifiedEntry.comparability.accountStatus, 'RECORDED_ACCOUNT')
  assert.equal(identifiedEntry.comparability.groups[0].reasons.length, 0)
  assert.match(identifiedEntry.comparability.groups[0].key, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(identifiedHistory.body).includes('synthetic-account'), false)
  assert.equal(JSON.stringify(identifiedHistory.body).includes('accountFingerprint'), false)
  assert.equal((await readFile(join(settings, 'quota-history', 'codex.json'), 'utf8')).includes('synthetic-account'), false)

  if (!packaged) {
    // Validate Kiro opt-in, ACP query, credit balance rendering and throttling through actual Electron/Java.
    await page.getByLabel('Read Kiro account credits').check()
    await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.kiroAccountQuotaEnabled === true }, { timeout: 60_000 }).toBe(true)
    await expect(page.getByRole('region', { name: 'Plan quota observations' })).toContainText('42.5 used / 50 credits · 7.5 remaining at query time', { timeout: 15_000 })
    const creditQuota = await page.evaluate(() => window.llmMeter.readQuota('KIRO', crypto.randomUUID()))
    assert.equal(creditQuota.body[0].snapshot.source, 'KIRO_CLI')
    assert.equal(creditQuota.body[0].snapshot.creditQuota.allowances[0].remaining, '7.5')
    const creditComparison = await page.evaluate(() => window.llmMeter.readQuotaHistory('KIRO', crypto.randomUUID()))
    assert.equal(creditComparison.body.observations[0].accountVerified, false)
    assert.equal(creditComparison.body.observations[0].comparability.accountStatus, 'UNVERIFIED')
    assert.equal(creditComparison.body.observations[0].comparability.groups[0].key, null)
    assert.equal(creditComparison.body.observations[0].comparability.groups[0].reasons.includes('RESET_DATE_ONLY'), true)

    assert.equal((await readFile(join(root, 'kiro-calls'), 'utf8')).trim().split('\n').length, 1)
    // Exercise the actual opt-in, Java process discovery, fixed RPC, reader, quota IPC and dashboard using only the fake IDE.
    await page.getByLabel('Read Antigravity IDE quota').check()
    await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.antigravityIdeQuotaEnabled === true }, { timeout: 60_000 }).toBe(true)
    let idePanel = page.getByRole('region', { name: 'Plan quota observations' })
    await expect(idePanel).toContainText('Synthetic IDE model', { timeout: 15_000 })
    await expect(idePanel).toContainText('40% last reported used')
    const ideResult = await page.evaluate(() => window.llmMeter.readQuota('ANTIGRAVITY', crypto.randomUUID()))
    assert.equal(ideResult.status, 200)
    assert.equal(ideResult.body[0].snapshot.source, 'ANTIGRAVITY_IDE')
    assert.equal(ideResult.body[0].snapshot.planType, null)
    assert.equal(ideResult.body[0].snapshot.windows[0].forecast, undefined)
    const savedIdeQuota = await page.evaluate(() => window.llmMeter.readQuotaHistory('ANTIGRAVITY', crypto.randomUUID()))
    assert.equal(savedIdeQuota.body.status, 'READY')
    assert.equal(savedIdeQuota.body.observations[0].snapshot.source, 'ANTIGRAVITY_IDE')
    assert.equal(savedIdeQuota.body.observations[0].snapshot.windows[0].usedPercent, 40)
    assert.equal(savedIdeQuota.body.observations[0].comparability.accountStatus, 'UNVERIFIED')
    assert.equal(savedIdeQuota.body.observations[0].comparability.groups[0].key, null)

    assert.equal(JSON.stringify(savedIdeQuota.body).includes('SYNTHETIC_IDE_TEST_TOKEN'), false)

    assert.equal(JSON.stringify(ideResult.body).includes('SYNTHETIC_IDE_TEST_TOKEN'), false)
    await page.getByRole('button', { name: 'Refresh quota' }).click()
    assert.equal((await readFile(join(root, 'ide-calls'), 'utf8')).trim().split('\n').length, 1)
    assert.equal(JSON.parse(await readFile(join(settings, 'settings.json'), 'utf8')).antigravityIdeQuotaEnabled, true)
    await page.getByLabel('IDE windows share one account').check()
    await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.antigravityIdeSharedAccount === true }, { timeout: 60_000 }).toBe(true)
    assert.equal(JSON.parse(await readFile(join(settings, 'settings.json'), 'utf8')).antigravityIdeSharedAccount, true)
    const beforeIdeRestart = await page.evaluate(() => window.llmMeter.getBackendState())
    await page.getByRole('button', { name: 'Restart service' }).click()
    await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.generation !== beforeIdeRestart.generation }, { timeout: 60_000 }).toBe(true)
    await expect(page.getByLabel('Read Antigravity IDE quota')).toBeEnabled({ timeout: 60_000 })
    await expect(page.getByLabel('Read Antigravity IDE quota')).toBeChecked()
    await expect(idePanel).toContainText('Synthetic IDE model', { timeout: 15_000 })
    // Capture a native-format synthetic account observation and restore it through a new Java process.
    const beforeRestartHistory = await page.evaluate(() => window.llmMeter.readQuotaHistory('KIRO', crypto.randomUUID()))
    assert.equal(beforeRestartHistory.body.status, 'READY')
    const savedCreditId = beforeRestartHistory.body.observations[0].id
    assert.equal(beforeRestartHistory.body.observations[0].snapshot.creditQuota.allowances[0].remaining, '7.5')
    // Validate the opt-in survives full relaunch and the external synthetic IDE remains independently owned.
    await application.close(); application = undefined
    await expect.poll(ownedJavaProcesses, { timeout: 10_000 }).toEqual([])
    assert.equal(ideHub.exitCode, null)
    application = await launch(); page = await application.firstWindow()
    await expect.poll(async () => (await page.evaluate(() => window.llmMeter.getBackendState())).phase, { timeout: 60_000 }).toBe('ready')
    await expect(page.getByLabel('Read Antigravity IDE quota')).toBeChecked()
    idePanel = page.getByRole('region', { name: 'Plan quota observations' })
    await expect(idePanel).toContainText('Synthetic IDE model', { timeout: 15_000 })
    await expect(page.getByLabel('Read Kiro account credits')).toBeChecked()
    const restoredAccountContext = await page.evaluate(() => window.llmMeter.readQuotaHistory('CODEX', crypto.randomUUID()))
    assert.equal(restoredAccountContext.body.observations.some(entry => entry.id === identifiedEntry.id && entry.comparability.groups[0].key === identifiedEntry.comparability.groups[0].key), true)
    const restoredCreditHistory = await page.evaluate(() => window.llmMeter.readQuotaHistory('KIRO', crypto.randomUUID()))
    assert.equal(restoredCreditHistory.body.observations.some(entry => entry.id === savedCreditId), true)

    await expect(idePanel).toContainText('42.5 used / 50 credits · 7.5 remaining at query time')
    await expect(page.getByLabel('IDE windows share one account')).toBeChecked()
    await page.getByLabel('IDE windows share one account').uncheck()
    await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && !next.antigravityIdeSharedAccount }, { timeout: 60_000 }).toBe(true)
    await page.getByLabel('Read Antigravity IDE quota').uncheck()
    await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && !next.antigravityIdeQuotaEnabled }, { timeout: 60_000 }).toBe(true)
    await expect(idePanel.getByText('Synthetic IDE model')).toHaveCount(0)
    assert.equal(JSON.parse(await readFile(join(settings, 'settings.json'), 'utf8')).antigravityIdeQuotaEnabled, undefined)
    await page.getByLabel('Read Kiro account credits').uncheck()
    await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && !next.kiroAccountQuotaEnabled }, { timeout: 60_000 }).toBe(true)
    await expect(idePanel.getByText('42.5 used / 50 credits · 7.5 remaining at query time')).toHaveCount(0)
    // An unavailable live account query must not erase or relabel the saved account observation.
    assert.equal((await page.evaluate(() => window.llmMeter.readQuota('KIRO', crypto.randomUUID()))).body[0].status, 'UNAVAILABLE')
    assert.equal((await page.evaluate(() => window.llmMeter.readQuotaHistory('KIRO', crypto.randomUUID()))).body.observations.some(entry => entry.id === savedCreditId), true)
    const creditArchivePath = join(settings, 'quota-history', 'kiro.json')
    const intactCreditArchive = await readFile(creditArchivePath, 'utf8')
    assert.equal(intactCreditArchive.includes('SYNTHETIC_IDE_TEST_TOKEN'), false)
    await writeFile(creditArchivePath, 'PRIVATE_CORRUPT_HISTORY')
    const brokenArchive = await page.evaluate(() => window.llmMeter.readQuotaHistory('KIRO', crypto.randomUUID()))
    assert.equal(brokenArchive.body.status, 'ERROR')
    assert.deepEqual(brokenArchive.body.failures, ['KIRO'])
    assert.equal((await page.evaluate(() => window.llmMeter.readQuota('CODEX', crypto.randomUUID()))).body[0].status, 'OBSERVED')
    assert.equal((await page.evaluate(() => window.llmMeter.readQuotaHistory('CODEX', crypto.randomUUID()))).body.status, 'READY')
    assert.equal(await readFile(creditArchivePath, 'utf8'), 'PRIVATE_CORRUPT_HISTORY')
    await writeFile(creditArchivePath, intactCreditArchive)
    await page.getByLabel('Agent', { exact: true }).selectOption('KIRO')
    const savedPanel = page.getByRole('region', { name: 'Saved quota history' })
    await savedPanel.getByText('Saved quota observations', { exact: true }).click()
    await expect(savedPanel.locator('ol summary').first()).toBeVisible()
    await savedPanel.locator('ol summary').first().click()
    await expect(savedPanel).toContainText('7.5 remaining at observation')
    await expect(savedPanel).toContainText('Account identity is unverified')
    await page.getByLabel('Agent', { exact: true }).selectOption('')

  }
  // Validates the third native source chooser saves Kiro without replacing the other configured agents.
  const beforeKiroSelection = await page.evaluate(() => window.llmMeter.getBackendState())
  await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, kiro)
  await page.getByRole('button', { name: 'Choose Kiro CLI sessions folder' }).click()
  await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.generation !== beforeKiroSelection.generation }, { timeout: 60_000 }).toBe(true)
  // Validates the Antigravity chooser updates its own setting while preserving the configured Codex source.
  const beforeAntigravitySelection = await page.evaluate(() => window.llmMeter.getBackendState())
  await application.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
  }, brain)
  await page.getByRole('button', { name: 'Choose Antigravity brain folder' }).click()
  await expect.poll(async () => { const next = await page.evaluate(() => window.llmMeter.getBackendState()); return next.phase === 'ready' && next.generation !== beforeAntigravitySelection.generation }, { timeout: 60_000 }).toBe(true)
  assert.deepEqual(JSON.parse(await readFile(join(settings, 'settings.json'), 'utf8')), { sources: { CODEX: sessions, ANTIGRAVITY: brain, KIRO: kiro } })
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
  await expect(page.locator('#records table')).toHaveCount(0)
  assert.deepEqual(JSON.parse(await readFile(join(root, 'settings/settings.json'), 'utf8')), { sources: { CODEX: empty, ANTIGRAVITY: brain, KIRO: kiro } })
  await application.close(); application = undefined
  await expect.poll(ownedJavaProcesses, { timeout: 10_000 }).toEqual([])
  {
    // Validates both independently selected source folders survive a complete application relaunch.
    delete environment.LLM_METER_SESSIONS_DIRECTORY
    delete environment.LLM_METER_ANTIGRAVITY_BRAIN_DIRECTORY
    delete environment.LLM_METER_KIRO_SESSIONS_DIRECTORY
    application = await launch()
    const reopened = await application.firstWindow()
    await expect.poll(async () => (await reopened.evaluate(() => window.llmMeter.getBackendState())).phase, { timeout: 60_000 }).toBe('ready')
    await expect(reopened.getByText('No recorded usage in this period')).toBeVisible()
    await application.close(); application = undefined
    await expect.poll(ownedJavaProcesses, { timeout: 10_000 }).toEqual([])
  }
  console.log('Desktop integration passed: three agents, recorded Kiro credits, opt-in Kiro account quota, normalized token subtotals, provider/date/metric filters, background updates, safe failure isolation, durable quota history, recorded account/cycle contexts, per-agent settings, relaunch, and owned Java cleanup.')
} finally {
  if (application) await application.close()
  if (ideHub && ideHub.exitCode === null && ideHub.signalCode === null) {
    const exited = new Promise(resolve => ideHub.once('exit', resolve))
    ideHub.kill('SIGTERM'); await exited
  }
  await rm(root, { recursive: true, force: true })
}
