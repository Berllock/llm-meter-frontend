import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { AgentSources, DesktopAgent } from '../shared/desktop-contract.js'
export async function readSources(directory: string): Promise<AgentSources> {
  try {
    const value = JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8')) as { sessionsDirectory?: unknown; sources?: Record<string, unknown> }
    const result: AgentSources = {}
    for (const provider of ['CODEX', 'ANTIGRAVITY'] as const) {
      const source = value.sources?.[provider] ?? (provider === 'CODEX' ? value.sessionsDirectory : undefined)
      if (typeof source === 'string' && isAbsolute(source)) result[provider] = source
    }
    return result
  } catch { return {} }
}
export async function readSource(directory: string): Promise<string | null> {
  return (await readSources(directory)).CODEX ?? null
}
export async function saveSource(directory: string, source: string, provider: DesktopAgent = 'CODEX') {
  if (!isAbsolute(source)) throw new Error('An absolute source path is required')
  const sources = { ...await readSources(directory), [provider]: source }
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `settings-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, JSON.stringify({ sources }), { mode: 0o600 })
    await rename(temporary, join(directory, 'settings.json'))
  } finally { await rm(temporary, { force: true }) }
}
