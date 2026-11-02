import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Distribution builds currently require Linux x64')
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const app = join(root, '.desktop-build/app')
await rm(app, { recursive: true, force: true }); await mkdir(app, { recursive: true })
await cp(join(root, 'dist'), join(app, 'dist'), { recursive: true })
await cp(join(root, 'dist-desktop'), join(app, 'dist-desktop'), { recursive: true, filter: path => !path.endsWith('.map') && !path.endsWith('.tsbuildinfo') })
await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'llm-meter-personal', productName: 'LLM Meter Personal', desktopName: 'com.llmeter.personal.desktop', version: metadata.version,
  description: metadata.description, author: metadata.author, license: 'UNLICENSED', type: 'module', main: metadata.main }, null, 2) + '\n')

const packages = ['react', 'react-dom', 'scheduler', '@tanstack/react-query', '@tanstack/query-core', 'lucide-react', 'vite']
const notices = await Promise.all(packages.map(async name => {
  const folder = join(root, 'node_modules', name)
  const info = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'))
  return `${name} ${info.version}\n${await readFile(join(folder, name === 'vite' ? 'LICENSE.md' : 'LICENSE'), 'utf8')}`
}))
await writeFile(join(root, '.desktop-build/THIRD_PARTY_NOTICES.txt'), notices.join('\n\n--------------------\n\n'))
