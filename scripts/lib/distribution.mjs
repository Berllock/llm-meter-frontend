import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { listPackage, extractFile } from '@electron/asar'

export async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
export async function verifiedDownload(url, destination, expected, fetcher = fetch) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('A pinned SHA-256 is required')
  if ((await stat(destination).catch(() => null))?.isFile() && await sha256(destination) === expected) return
  await mkdir(dirname(destination), { recursive: true })
  const temporary = destination + '.download'
  try {
    const response = await fetcher(url)
    if (!response.ok || !response.body) throw new Error('The pinned runtime download failed')
    const hash = createHash('sha256')
    let bytes = 0
    const verify = new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length
      if (bytes > 512 * 1024 * 1024) { done(new Error('Runtime download exceeds the supported size')); return }
      hash.update(chunk); done(null, chunk)
    } })
    await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(temporary, { mode: 0o600 }))
    if (hash.digest('hex') !== expected) throw new Error('Runtime SHA-256 mismatch; extraction was refused')
    await rename(temporary, destination)
  } finally { await rm(temporary, { force: true }) }
}
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Build command failed')))
  })
}
export async function assertDistribution(bundle) {
  for (const name of ['llm-meter-personal', 'resources/app.asar', 'resources/backend/llm-meter-backend.jar', 'resources/runtime/bin/java', 'resources/runtime/release', 'resources/THIRD_PARTY_NOTICES.txt', 'resources/runtime/legal/java.base/LICENSE', 'LICENSE.electron.txt', 'LICENSES.chromium.html']) {
    if (!(await stat(join(bundle, name)).catch(() => null))?.isFile()) throw new Error('Required distribution file is missing: ' + name)
  }
  if (await stat(join(bundle, 'resources/backend/java-runtime.json')).catch(() => null)) throw new Error('A development machine locator must not be distributed')
  assertApplicationArchive(join(bundle, 'resources/app.asar'))
  const release = await readFile(join(bundle, 'resources/runtime/release'), 'utf8')
  if (!/^JAVA_VERSION="21\./m.test(release)) throw new Error('The distribution requires Java 21')
}

export function assertApplicationArchive(archive) {
  const entries = listPackage(archive)
  const allowed = path => path === '/package.json' || path === '/dist' || path.startsWith('/dist/') || path === '/dist-desktop' || path.startsWith('/dist-desktop/')
  if (entries.some(path => !allowed(path) || /\.(map|ts|cts|tsbuildinfo)$/.test(path) || path.includes('.test.') || path.split('/').some(part => part.startsWith('.')))) throw new Error('Unexpected development files in the application archive')
  for (const required of ['/package.json', '/dist/index.html', '/dist-desktop/desktop/main.js', '/dist-desktop/desktop/preload.cjs']) {
    if (!entries.includes(required)) throw new Error('Required application archive entry is missing')
  }
  const metadata = JSON.parse(extractFile(archive, 'package.json').toString())
  if (metadata.main !== 'dist-desktop/desktop/main.js' || metadata.type !== 'module' || Object.keys(metadata.dependencies ?? {}).length) throw new Error('Unexpected runtime package metadata')
}
