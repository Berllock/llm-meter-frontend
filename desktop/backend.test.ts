// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BackendManager, validPeriod } from './backend'

let directory: string
let manager: BackendManager
let children: ChildProcess[]
let readyFile: string
let launchArguments: readonly string[]
const period = { from: '2026-10-24', to: '2026-10-26', zone: 'UTC' }
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'llm-meter-test-'))
  children = []
  await writeFile(join(directory, 'backend.jar'), '')
  await writeFile(join(directory, 'fake.cjs'), `
    const fs = require('node:fs')
    const http = require('node:http')
    const arg = name => process.argv.find(v => v.startsWith('--' + name + '='))?.split('=').slice(1).join('=')
    const mode = process.env.LLM_METER_TEST_MODE
    if (mode === 'exit') process.exit(1)
    if (mode === 'ignore-term') process.on('SIGTERM', () => {})
    const server = http.createServer((req, res) => {
      if (req.headers['x-llm-meter-token'] !== process.env.LLM_METER_DESKTOP_TOKEN) { res.writeHead(401).end(); return }
      res.setHeader('Content-Type', 'application/json')
      if (mode === 'collection-error') { res.writeHead(503).end(); return }
      if (!req.url.startsWith('/api/usage/daily/collection?')) { res.writeHead(404).end(); return }
      res.end('[]')
    })
    server.listen(0, '127.0.0.1', () => {
      if (mode !== 'no-ready') fs.writeFileSync(arg('llm-meter.desktop.ready-file'), JSON.stringify({ port: server.address().port, instanceId: arg('llm-meter.desktop.instance-id') }))
    })
  `)
})
afterEach(async () => {
  await manager?.stop()
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await rm(directory, { recursive: true, force: true })
})
function create(mode = '') {
  manager = new BackendManager({ jarPath: join(directory, 'backend.jar'), startupTimeout: 2_000, stopTimeout: 100,
    launch: ((_command: string, args: readonly string[], options: object) => {
      launchArguments = args
      readyFile = args.find(v => v.startsWith('--llm-meter.desktop.ready-file='))!.split('=').slice(1).join('=')
      const actual = spawn(process.execPath, [join(directory, 'fake.cjs'), ...args], { ...options, env: { ...(options as { env: NodeJS.ProcessEnv }).env, LLM_METER_TEST_MODE: mode } })
      children.push(actual)
      return actual
    }) as typeof spawn,
  })
  return manager
}
describe('managed backend lifecycle', () => {
  // Validates readiness identity, protected collection, and cleanup of the owned process and readiness file.
  it('starts, collects with its private token, and stops', async () => {
    create(); await manager.start({ CODEX: directory })
    expect(manager.state.phase).toBe('ready')
    expect(await manager.readDaily(period)).toEqual({ status: 200, body: [] })
    const ready = JSON.parse(await readFile(readyFile, 'utf8')) as { port: number; instanceId: string }
    expect(ready.instanceId).toBe(manager.state.generation)
    expect((await fetch(`http://127.0.0.1:${ready.port}/api/usage/daily`)).status).toBe(401)
    await manager.stop()
    expect(children[0].signalCode).toBe('SIGTERM')
    await expect(readFile(readyFile)).rejects.toThrow()
  })
  // Validates that data collection failure does not incorrectly mark a running service as unready.
  it('keeps service readiness separate from collection success', async () => {
    create('collection-error'); await manager.start({ CODEX: directory })
    expect(manager.state.phase).toBe('ready')
    expect(await manager.readDaily(period)).toEqual({ status: 503, body: null })
    expect(manager.state.phase).toBe('ready')
  })
  // Validates bounded startup and cleanup when readiness never arrives.
  it('stops a child that times out during startup', async () => {
    create('no-ready'); await manager.start({ CODEX: directory })
    expect(manager.state.phase).toBe('error')
    expect(manager.state.message).toContain('in time')
    expect(children[0].signalCode).toBe('SIGTERM')
  })
  // Validates safe failure when the child exits before completing startup.
  it('reports early exit without exposing process output', async () => {
    create('exit'); await manager.start({ CODEX: directory })
    expect(manager.state.phase).toBe('error')
    expect(manager.state.message).toContain('exited before')
    expect(manager.state.message).not.toContain(directory)
  })
  // Validates forced termination when an owned service ignores graceful shutdown.
  it('forces shutdown after the grace period', async () => {
    create('ignore-term'); await manager.start({ CODEX: directory }); await manager.stop()
    expect(children[0].signalCode).toBe('SIGKILL')
  })
  // Validates cancellation during startup without leaving an owned child running.
  it('cancels pending startup', async () => {
    create('no-ready')
    const starting = manager.start({ CODEX: directory })
    await new Promise(resolve => setTimeout(resolve, 200))
    await manager.stop(); await starting
    expect(manager.state.phase).toBe('stopped')
    expect(children.every(child => child.exitCode !== null || child.signalCode !== null)).toBe(true)
  })
  // Validates missing Java produces a recoverable error and shutdown does not hang.
  it('handles an absent Java executable', async () => {
    manager = new BackendManager({ jarPath: join(directory, 'backend.jar'), javaCommand: join(directory, 'missing-java') })
    await manager.start({ CODEX: directory })
    expect(manager.state.phase).toBe('error')
    expect(manager.state.message).toContain('Java could not be started')
    await manager.stop()
  })
  // Validates runtime validation of renderer inputs before constructing the fixed local request.
  it('rejects invalid dates, ranges, and zones', async () => {
    create()
    expect(validPeriod(period)).toBe(true)
    expect(validPeriod({ ...period, from: '2026-02-30' })).toBe(false)
    expect(validPeriod({ ...period, to: '2026-01-01' })).toBe(false)
    expect(validPeriod({ ...period, zone: 'not-a-zone' })).toBe(false)
    expect(await manager.readDaily({})).toEqual({ status: 400, body: null })
  })
})

// Validates Antigravity can run independently and both configured sources reach the same owned backend.
it('starts with Antigravity alone or alongside Codex', async () => {
  create()
  await manager.start({ ANTIGRAVITY: directory })
  expect(manager.state.phase).toBe('ready')
  await manager.stop()
  await manager.start({ CODEX: directory, ANTIGRAVITY: directory })
  expect(manager.state.phase).toBe('ready')
  expect(validPeriod({ ...period, provider: 'ANTIGRAVITY' })).toBe(true)
  expect(validPeriod({ ...period, provider: 'CODEX&from=invalid' })).toBe(false)
})

// Validates a missing source does not block service startup for another agent or disappear from configuration.
it('starts when at least one configured source is available', async () => {
  create()
  await manager.start({ CODEX: directory, ANTIGRAVITY: join(directory, 'missing') })
  expect(manager.state.phase).toBe('ready')
  expect(children).toHaveLength(1)
  expect(launchArguments).toContain(`--llm-meter.antigravity.brain-directory=${join(directory, 'missing')}`)
})
