import { readFile, mkdir, rm, writeFile, rename } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifiedDownload, run } from './lib/distribution.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Distribution builds currently require a Linux x64 host')
const pin = JSON.parse(await readFile(join(root, 'build/java-runtime.json'), 'utf8'))
if (pin.platform !== 'linux' || pin.architecture !== 'x64' || !pin.version.startsWith('21.')
  || !pin.url.startsWith('https://github.com/adoptium/temurin21-binaries/releases/download/')) throw new Error('Unsupported runtime pin')
const build = join(root, '.desktop-build')
const archive = join(build, 'downloads', `temurin-${pin.version}-linux-x64.tar.gz`)
await verifiedDownload(pin.url, archive, pin.sha256)
const jdk = join(build, 'jdk')
await rm(jdk, { recursive: true, force: true }); await mkdir(jdk, { recursive: true })
await run('tar', ['--extract', '--gzip', '--file', archive, '--directory', jdk, '--strip-components=1'])
const temporary = join(build, 'runtime-new')
await rm(temporary, { recursive: true, force: true })
const modules = ['java.se', 'jdk.unsupported', 'jdk.crypto.ec', 'jdk.management', 'jdk.charsets', 'jdk.zipfs', 'jdk.localedata']
await run(join(jdk, 'bin/jlink'), ['--module-path', join(jdk, 'jmods'), '--add-modules', modules.join(','), '--strip-debug', '--no-header-files', '--no-man-pages', '--compress=zip-6', '--output', temporary])
await run(join(temporary, 'bin/java'), ['-version'])
await writeFile(join(temporary, 'llm-meter-runtime.json'), JSON.stringify({ vendor: pin.vendor, version: pin.version, platform: pin.platform, architecture: pin.architecture, jdkSha256: pin.sha256, modules }, null, 2) + '\n')
const destination = join(build, 'runtime')
await rm(destination, { recursive: true, force: true }); await rename(temporary, destination)
console.log('Prepared the pinned Java 21 runtime with its legal notices.')
