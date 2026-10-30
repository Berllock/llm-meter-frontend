import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
export async function readSource(directory: string): Promise<string | null> {
  try {
    const value = JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8')) as { sessionsDirectory?: unknown }
    return typeof value.sessionsDirectory === 'string' && isAbsolute(value.sessionsDirectory) ? value.sessionsDirectory : null
  } catch { return null }
}
export async function saveSource(directory: string, source: string) {
  if (!isAbsolute(source)) throw new Error('An absolute source path is required')
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `settings-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, JSON.stringify({ sessionsDirectory: source }), { mode: 0o600 })
    await rename(temporary, join(directory, 'settings.json'))
  } finally { await rm(temporary, { force: true }) }
}
