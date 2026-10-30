import { spawn, execFile } from 'node:child_process'
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backend = process.env.LLM_METER_BACKEND_PROJECT || resolve(root, '../llm-meter-personal')
if (process.platform === 'win32') throw new Error('This development launcher currently supports Linux/macOS. Windows packaging is a future milestone.')
const javaInfo = await new Promise((resolve, reject) => {
  execFile(process.env.LLM_METER_JAVA || 'java', ['-XshowSettings:properties', '-version'], { cwd: backend }, (error, stdout, stderr) => {
    if (error) { reject(new Error('Java could not be resolved from the backend project. Configure Java 21 and retry.')); return }
    const home = (stdout + stderr).match(/^\s*java\.home = (.+)$/m)?.[1]?.trim()
    if (!home) { reject(new Error('Java runtime information was unavailable')); return }
    resolve({ javaCommand: join(home, 'bin', 'java') })
  })
})
const child = spawn('mvn', ['-DskipTests', 'package'], { cwd: backend, stdio: 'inherit', shell: false })
await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Backend build failed'))) })
const target = join(backend, 'target')
const jars = await Promise.all((await readdir(target)).filter(name => /^llm-meter-personal-.*\.jar$/.test(name) && !/-(sources|javadoc)\.jar$/.test(name)).map(async name => ({ name, time: (await stat(join(target, name))).mtimeMs })))
jars.sort((a, b) => b.time - a.time)
if (!jars[0]) throw new Error('The executable backend JAR was not found')
await mkdir(join(root, 'resources/backend'), { recursive: true })
await copyFile(join(target, jars[0].name), join(root, 'resources/backend/llm-meter-backend.jar'))

// Machine-local development runtime locator; not a bundled Java runtime.
await writeFile(join(root, 'resources/backend/java-runtime.json'), JSON.stringify(javaInfo), { mode: 0o600 })
