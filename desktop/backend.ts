import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSources, BackendState, DesktopPeriod, DesktopResponse } from '../shared/desktop-contract.js'

type Options = {
  jarPath: string
  javaCommand?: string
  bundledJava?: boolean
  startupTimeout?: number
  stopTimeout?: number
  launch?: typeof spawn
}
class StartupError extends Error {}
export function validPeriod(value: unknown): value is DesktopPeriod {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
  if (p.provider !== undefined && !['CODEX', 'ANTIGRAVITY'].includes(p.provider as string)) return false
  if (!date(p.from) || !date(p.to) || p.from > p.to || typeof p.zone !== 'string' || p.zone.length > 100) return false
  try { new Intl.DateTimeFormat('en', { timeZone: p.zone }); return true } catch { return false }
}

export class BackendManager {
  private child?: ChildProcess
  private directory?: string
  private token = ''
  private port?: number
  private epoch = 0
  private starting?: Promise<void>
  private lifetime = new AbortController()
  private listeners = new Set<(state: BackendState) => void>()
  private current: BackendState = { phase: 'stopped', message: 'Local service stopped.', revision: 0, generation: '' }
  constructor(private readonly options: Options) {}
  get state(): BackendState { return { ...this.current } }
  subscribe(listener: (state: BackendState) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(phase: BackendState['phase'], message: string, generation = this.current.generation) {
    this.current = { phase, message, generation, revision: this.current.revision + 1 }
    for (const listener of this.listeners) listener(this.state)
  }
  start(sources: AgentSources): Promise<void> {
    if (this.starting) return this.starting
    if (this.current.phase === 'ready') return Promise.resolve()
    const epoch = ++this.epoch
    this.starting = this.launch(sources, epoch).finally(() => { this.starting = undefined })
    return this.starting
  }
  private async launch(sources: AgentSources, epoch: number) {
    await this.release()
    if (epoch !== this.epoch) return
    const generation = randomUUID()
    this.update('starting', 'Starting the local Java service…', generation)
    try {
      if (!(await stat(this.options.jarPath).catch(() => null))?.isFile()) throw new StartupError(this.options.bundledJava ? 'The local service bundle is missing. Reinstall the application.' : 'The backend bundle is missing. Run npm run desktop:prepare and retry.')
      if (!Object.values(sources).length) {
        this.update('needs-source', 'Choose a source folder for Codex or Antigravity.'); return
      }
      const available = await Promise.all(Object.values(sources).map(async source => (await stat(source).catch(() => null))?.isDirectory() ?? false))
      if (!available.some(Boolean)) {
        this.update('needs-source', 'Configured agent folders are unavailable. Choose a source folder again.'); return
      }
      this.directory = await mkdtemp(join(tmpdir(), 'llm-meter-desktop-'))
      if (epoch !== this.epoch) return
      const ready = join(this.directory, 'ready.json')
      this.token = randomBytes(32).toString('hex')
      this.lifetime = new AbortController()
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('SPRING_') && !key.replaceAll('_', '').startsWith('LLMMETER')))
      if (this.options.bundledJava) {
        for (const key of ['JAVA_HOME', 'JRE_HOME', 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'CLASSPATH']) delete env[key]
      }
      env.LLM_METER_DESKTOP_TOKEN = this.token
      const child = (this.options.launch ?? spawn)(this.options.javaCommand ?? 'java', [
        '-jar', this.options.jarPath, '--server.address=127.0.0.1', '--server.port=0',
        '--spring.config.location=classpath:/application.properties', '--spring.profiles.active=desktop',
        '--spring.devtools.restart.enabled=false', '--spring.main.banner-mode=off', '--logging.level.root=ERROR',
        ...(sources.CODEX ? [`--llm-meter.codex.sessions-directory=${sources.CODEX}`] : []),
        ...(sources.ANTIGRAVITY ? [`--llm-meter.antigravity.brain-directory=${sources.ANTIGRAVITY}`] : []),
        `--llm-meter.desktop.ready-file=${ready}`,
        `--llm-meter.desktop.instance-id=${generation}`,
      ], { cwd: this.directory, env, stdio: 'ignore', windowsHide: true })
      this.child = child
      let failed = false
      child.on('error', () => { failed = true })
      child.on('exit', () => {
        if (this.child === child && this.current.phase === 'ready') {
          this.port = undefined; this.lifetime.abort()
          this.update('error', 'The local service stopped unexpectedly. Restart it to continue.')
        }
      })
      const deadline = Date.now() + (this.options.startupTimeout ?? 60_000)
      while (epoch === this.epoch && Date.now() < deadline) {
        if (failed) throw new StartupError(this.options.bundledJava ? 'The bundled local service could not be started. Reinstall the application and retry.' : 'Java could not be started. Install Java 21 or check LLM_METER_JAVA, then retry.')
        if (child.exitCode !== null || child.signalCode !== null) throw new StartupError(this.options.bundledJava ? 'The local service exited before becoming ready. Restart it or choose another sessions folder.' : 'The Java service exited before becoming ready. Check Java 21 and your session folder, then retry.')
        const data = await readFile(ready, 'utf8').catch(() => null)
        if (data) {
          const value = JSON.parse(data) as { port?: number; instanceId?: string }
          if (value.instanceId !== generation || !Number.isInteger(value.port) || value.port! < 1 || value.port! > 65535) throw new Error('Invalid readiness')
          if (epoch !== this.epoch) return
          this.port = value.port
          this.update('ready', 'Local service ready. Use Auto-refresh to control periodic collection.')
          return
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (epoch === this.epoch) throw new StartupError('The Java service did not become ready in time. Restart it to try again.')
    } catch (error) {
      await this.release()
      if (epoch === this.epoch) this.update('error', error instanceof StartupError ? error.message : 'The local service could not be started. Restart it or choose another sessions folder.')
    }
  }
  async readDaily(period: unknown, signal?: AbortSignal): Promise<DesktopResponse> {
    if (!validPeriod(period)) return { status: 400, body: null }
    if (!this.port || this.current.phase !== 'ready') return { status: 0, body: null }
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/api/usage/daily/collection?${new URLSearchParams(period)}`, {
        headers: { Accept: 'application/json', 'X-LLM-Meter-Token': this.token },
        signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
        redirect: 'error',
      })
      return { status: response.status, body: response.ok ? await response.json() : null }
    } catch { return { status: 0, body: null } }
  }
  async stop() {
    ++this.epoch
    const pending = this.starting
    await this.release()
    await pending
    await this.release()
    this.update('stopped', 'Local service stopped.')
  }
  private async release() {
    this.port = undefined; this.lifetime.abort()
    const child = this.child
    this.child = undefined
    if (child?.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { child.kill('SIGKILL') }, this.options.stopTimeout ?? 5_000)
        const done = () => { clearTimeout(timer); resolve() }
        child.once('exit', done); child.once('error', done)
        child.kill('SIGTERM')
      })
    }
    const directory = this.directory
    this.directory = undefined; this.token = ''
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}
