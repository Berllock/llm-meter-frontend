import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseQuota } from '../src/features/quota/api/quotaParser.js'
import { alertRank, quotaAlerts } from '../src/features/quota/model/alerts.js'
import type { QuotaAlert } from '../src/features/quota/model/alerts.js'
import type { QuotaNotificationState } from '../shared/desktop-contract.js'

type Receipt = { key: string; rank: number; until: number }
const MAX_RECEIPTS = 512
const MAX_LIFETIME = 30 * 86_400_000

/** Notification decisions use validated backend evidence; only opaque delivery receipts reach disk. */
export class QuotaNotifications {
  private receipts = new Map<string, Receipt>()
  private enabled = false
  private error: QuotaNotificationState['error'] = null
  private pending = Promise.resolve()
  private epoch = 0
  constructor(private readonly directory: string, private readonly supported: () => boolean,
    private readonly deliver: (alert: QuotaAlert) => void, private readonly changed: () => void = () => {}) {}

  get state(): QuotaNotificationState { return { enabled: this.enabled, supported: this.supported(), error: this.error } }
  async initialize(enabled: boolean, now = Date.now()) {
    this.enabled = enabled
    try {
      const file = join(this.directory, 'quota-notifications.json')
      const metadata = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (!metadata) return
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 131_072) throw new Error('Invalid receipt file')
      const value = JSON.parse(await readFile(file, 'utf8')) as { version?: unknown; receipts?: unknown }
      if (value.version !== 1 || !Array.isArray(value.receipts) || value.receipts.length > MAX_RECEIPTS) throw new Error('Invalid receipts')
      const restored = new Map<string, Receipt>()
      for (const item of value.receipts as Receipt[]) {
        if (!item || typeof item.key !== 'string' || !/^[a-f0-9]{64}$/.test(item.key) || restored.has(item.key)
          || !Number.isSafeInteger(item.rank) || item.rank < 1 || item.rank > 3 || !Number.isFinite(item.until)
          || item.until > now + MAX_LIFETIME) throw new Error('Invalid receipt')
        if (item.until > now) restored.set(item.key, item)
      }
      this.receipts = restored
    } catch { this.error = 'STORAGE' }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled; this.epoch++
    if (this.error === 'DELIVERY') this.error = null
    this.changed()
  }
  deliveryFailed() { this.error = 'DELIVERY'; this.changed() }

  observe(payload: unknown, contexts: Partial<Record<QuotaAlert['provider'], string>>, current: () => boolean, now = Date.now(), provider?: QuotaAlert['provider']): Promise<void> {
    const epoch = this.epoch
    this.pending = this.pending.then(async () => {
      if (!this.enabled || this.error || !this.supported() || epoch !== this.epoch || !current()) return
      let alerts: QuotaAlert[]
      try { alerts = quotaAlerts(parseQuota(payload, provider), Math.max(now, Date.now())) } catch { return }
      const selected = new Map<string, QuotaAlert>()
      for (const alert of alerts) {
        if (!contexts[alert.provider]) continue
        const key = createHash('sha256').update(contexts[alert.provider]! + '\n' + alert.key).digest('hex')
        if (!selected.has(key) || alertRank[alert.kind] > alertRank[selected.get(key)!.kind]) selected.set(key, alert)
      }
      const clock = Math.max(now, Date.now())
      const next = new Map([...this.receipts].filter(([, value]) => value.until > clock))
      const deliveries = new Map<QuotaAlert['provider'], QuotaAlert>()
      for (const [key, alert] of selected) {
        const old = this.receipts.get(key)
        if (old && old.until > clock && old.rank >= alertRank[alert.kind]) continue
        next.delete(key)
        next.set(key, { key, rank: alertRank[alert.kind], until: Math.min(alert.dedupUntil, clock + MAX_LIFETIME) })
        const previous = deliveries.get(alert.provider)
        if (!previous || alertRank[alert.kind] > alertRank[previous.kind]) deliveries.set(alert.provider, alert)
      }
      if (!deliveries.size) return
      while (next.size > MAX_RECEIPTS) next.delete(next.keys().next().value!)
      // Reserve every qualifying condition, but show at most one generic notification per agent per response.
      await this.save(next)
      this.receipts = next
      for (const alert of deliveries.values()) {
        if (epoch !== this.epoch || !this.enabled || this.error || !current()) break
        if (!quotaAlerts(parseQuota(payload, provider), Math.max(now, Date.now())).some(candidate => candidate.key === alert.key && candidate.kind === alert.kind)) continue
        try { this.deliver(alert) } catch { this.deliveryFailed() }
      }
    }).catch(() => { this.error = 'STORAGE'; this.changed() })
    return this.pending
  }
  private async save(receipts: Map<string, Receipt>) {
    await mkdir(this.directory, { recursive: true })
    const file = join(this.directory, 'quota-notifications.json')
    const metadata = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (metadata && (!metadata.isFile() || metadata.isSymbolicLink())) throw new Error('Invalid receipt file')
    const temporary = join(this.directory, `notification-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, receipts: [...receipts.values()] }), { mode: 0o600 })
      await rename(temporary, file)
    } finally { await rm(temporary, { force: true }) }
  }
}
