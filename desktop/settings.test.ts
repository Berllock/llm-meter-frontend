// @vitest-environment node
import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSource, readSources, saveSource } from './settings'
// Validates that only the selected folder is persisted, without usage data or request tokens.
it('persists a selected absolute source folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-settings-'))
  try {
    await saveSource(root, root)
    expect(await readSource(root)).toBe(root)
    expect(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))).toEqual({ sources: { CODEX: root } })
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

// Validates legacy Codex settings migrate without losing either independently selected agent folder.
it('preserves both agents when migrating old settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-settings-'))
  try {
    await writeFile(join(root, 'settings.json'), JSON.stringify({ sessionsDirectory: root }))
    await saveSource(root, join(root, 'brain'), 'ANTIGRAVITY')
    expect(await readSources(root)).toEqual({ CODEX: root, ANTIGRAVITY: join(root, 'brain') })
    await saveSource(root, join(root, 'codex'))
    expect(await readSources(root)).toEqual({ CODEX: join(root, 'codex'), ANTIGRAVITY: join(root, 'brain') })
  } finally { await rm(root, { recursive: true, force: true }) }
})
