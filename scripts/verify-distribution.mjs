import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertDistribution, sha256 } from './lib/distribution.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'release')
await assertDistribution(join(output, 'linux-unpacked'))
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const names = (await readdir(output)).filter(name => name.startsWith(`LLM-Meter-Personal-${metadata.version}-linux-`) && (name.endsWith('.AppImage') || name.endsWith('.tar.gz'))).sort()
if (names.length !== 2) throw new Error('Expected one AppImage and one tar.gz distribution')
const sums = await Promise.all(names.map(async name => `${await sha256(join(output, name))}  ${name}`))
await writeFile(join(output, 'SHA256SUMS'), sums.join('\n') + '\n')
console.log('Verified bundle layout and wrote SHA256SUMS for both local artifacts.')
