// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { verifiedDownload } from '../scripts/lib/distribution.mjs'

// Validates a corrupt cached archive is replaced only by a download matching the pinned checksum.
it('verifies runtime bytes before accepting a cached or downloaded archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-download-test-'))
  const target = join(root, 'runtime.tar.gz')
  const contents = 'synthetic verified archive'
  const digest = createHash('sha256').update(contents).digest('hex')
  const fetcher = vi.fn().mockImplementation(async () => new Response(contents))
  try {
    await writeFile(target, 'corrupted')
    await verifiedDownload('https://example.invalid/runtime', target, digest, fetcher)
    expect(await readFile(target, 'utf8')).toBe(contents)
    await verifiedDownload('https://example.invalid/runtime', target, digest, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  } finally { await rm(root, { recursive: true, force: true }) }
})
// Validates a mismatched download cannot replace the archive and leaves no partial download behind.
it('rejects an incorrect runtime checksum', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-download-test-'))
  const target = join(root, 'runtime.tar.gz')
  try {
    await expect(verifiedDownload('https://example.invalid/runtime', target, '0'.repeat(64), async () => new Response('bad bytes'))).rejects.toThrow('SHA-256 mismatch')
    expect(await stat(target).catch(() => null)).toBeNull()
    expect(await stat(target + '.download').catch(() => null)).toBeNull()
  } finally { await rm(root, { recursive: true, force: true }) }
})

// Validates release inventory refuses source files, secrets, source maps, and runtime dependencies outside the explicit bundle.
it.each(['.env', 'src/private.ts', 'node_modules/unused/index.js', 'dist/assets/source.js.map'])('rejects unexpected archive content: %s', async name => {
  const { createPackage } = await import('@electron/asar')
  const { assertApplicationArchive } = await import('../scripts/lib/distribution.mjs')
  const { mkdir } = await import('node:fs/promises')
  const root = await mkdtemp(join(tmpdir(), 'meter-asar-test-'))
  const source = join(root, 'app')
  try {
    for (const path of ['dist/index.html', 'dist-desktop/desktop/main.js', 'dist-desktop/desktop/preload.cjs', name]) {
      const destination = join(source, path)
      const { dirname } = await import('node:path')
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, 'SYNTHETIC_NON_RELEASE_MARKER')
    }
    await writeFile(join(source, 'package.json'), JSON.stringify({ type: 'module', main: 'dist-desktop/desktop/main.js' }))
    const archive = join(root, 'app.asar')
    await createPackage(source, archive)
    expect(() => assertApplicationArchive(archive)).toThrow('Unexpected development files')
  } finally { await rm(root, { recursive: true, force: true }) }
})
