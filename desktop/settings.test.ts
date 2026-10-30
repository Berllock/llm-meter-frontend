// @vitest-environment node
import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSource, saveSource } from './settings'
// Validates that only the selected folder is persisted, without usage data or request tokens.
it('persists a selected absolute source folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-settings-'))
  try {
    await saveSource(root, root)
    expect(await readSource(root)).toBe(root)
    expect(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))).toEqual({ sessionsDirectory: root })
  } finally { await rm(root, { recursive: true, force: true }) }
})
// Validates recovery from missing, malformed, and relative folder settings.
it('ignores unusable settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-settings-'))
  try {
    expect(await readSource(root)).toBeNull()
    await writeFile(join(root, 'settings.json'), '{')
    expect(await readSource(root)).toBeNull()
    await writeFile(join(root, 'settings.json'), JSON.stringify({ sessionsDirectory: './relative' }))
    expect(await readSource(root)).toBeNull()
  } finally { await rm(root, { recursive: true, force: true }) }
})
