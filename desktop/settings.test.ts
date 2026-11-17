// @vitest-environment node
import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSource, readSources, readKiroQuotaEnabled, saveKiroQuotaEnabled, saveSource, readIdeQuotaEnabled, saveIdeQuotaEnabled, readIdeSharedAccount, saveIdeSharedAccount } from './settings'
import { readQuotaNotificationsEnabled, saveQuotaNotificationsEnabled } from './settings'
// Validates notification consent defaults off and survives every independent source/account setting update.
it('persists notification consent independently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-notification-settings-'))
  try {
    expect(await readQuotaNotificationsEnabled(root)).toBe(false)
    await saveQuotaNotificationsEnabled(root, true)
    await saveSource(root, root, 'CODEX')
    await saveKiroQuotaEnabled(root, true)
    await saveIdeQuotaEnabled(root, true)
    await saveIdeSharedAccount(root, true)
    expect(await readQuotaNotificationsEnabled(root)).toBe(true)
    await saveQuotaNotificationsEnabled(root, false)
    expect(await readKiroQuotaEnabled(root)).toBe(true)
    expect(await readIdeSharedAccount(root)).toBe(true)
    expect(await readIdeQuotaEnabled(root)).toBe(true)
    expect(await readQuotaNotificationsEnabled(root)).toBe(false)
    expect(await readSources(root)).toEqual({ CODEX: root })
  } finally { await rm(root, { recursive: true, force: true }) }
})
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

// Validates selecting Kiro preserves existing agent folders and survives rereading settings.
it('persists Kiro alongside the other agents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-settings-'))
  try {
    await saveSource(root, join(root, 'codex'), 'CODEX')
    await saveSource(root, join(root, 'brain'), 'ANTIGRAVITY')
    await saveSource(root, join(root, 'kiro'), 'KIRO')
    expect(await readSources(root)).toEqual({ CODEX: join(root, 'codex'), ANTIGRAVITY: join(root, 'brain'), KIRO: join(root, 'kiro') })
  } finally { await rm(root, { recursive: true, force: true }) }
})

// Validates opt-in is false by default and survives source changes without persisting any IDE connection credentials.
it('persists IDE quota opt-in independently from source folders', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-ide-settings-'))
  try {
    expect(await readIdeQuotaEnabled(root)).toBe(false)
    await saveSource(root, root, 'ANTIGRAVITY')
    await saveIdeQuotaEnabled(root, true)
    await saveSource(root, join(root, 'codex'), 'CODEX')
    expect(await readIdeQuotaEnabled(root)).toBe(true)
    expect(await readSources(root)).toEqual({ ANTIGRAVITY: root, CODEX: join(root, 'codex') })
    expect(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))).toEqual({ sources: { ANTIGRAVITY: root, CODEX: join(root, 'codex') }, antigravityIdeQuotaEnabled: true })
    await saveIdeQuotaEnabled(root, false)
    expect(await readIdeQuotaEnabled(root)).toBe(false)
    expect(await readSources(root)).toEqual({ ANTIGRAVITY: root, CODEX: join(root, 'codex') })
  } finally { await rm(root, { recursive: true, force: true }) }
})

// Validates shared-account consent is opt-in, persists independently and is preserved across quota/source settings changes.
it('preserves the explicit shared-account policy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-ide-shared-'))
  try {
    expect(await readIdeSharedAccount(root)).toBe(false)
    await saveIdeSharedAccount(root, true)
    await saveIdeQuotaEnabled(root, true)
    await saveSource(root, root, 'ANTIGRAVITY')
    expect(await readIdeSharedAccount(root)).toBe(true)
    expect(await readIdeQuotaEnabled(root)).toBe(true)
    await saveIdeSharedAccount(root, false)
    expect(await readIdeSharedAccount(root)).toBe(false)
    expect(await readIdeQuotaEnabled(root)).toBe(true)
  } finally { await rm(root, { recursive: true, force: true }) }
})

// Validates Kiro opt-in is preserved across every independent source and quota settings update.
it('persists Kiro account quota opt-in without losing other preferences', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-kiro-settings-'))
  try {
    expect(await readKiroQuotaEnabled(root)).toBe(false)
    await saveKiroQuotaEnabled(root, true)
    await saveIdeQuotaEnabled(root, true)
    await saveIdeSharedAccount(root, true)
    await saveSource(root, root, 'KIRO')
    expect(await readKiroQuotaEnabled(root)).toBe(true)
    await saveKiroQuotaEnabled(root, false)
    expect(await readKiroQuotaEnabled(root)).toBe(false)
    expect(await readIdeQuotaEnabled(root)).toBe(true)
    expect(await readIdeSharedAccount(root)).toBe(true)
    expect(await readSources(root)).toEqual({ KIRO: root })
  } finally { await rm(root, { recursive: true, force: true }) }
})
