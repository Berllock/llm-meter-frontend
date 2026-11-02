// @vitest-environment node
import { expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveBackendRuntime } from './runtime'

// Validates packaged applications always use their own runtime and ignore host Java overrides.
it('uses only the bundled Java runtime in a packaged app', async () => {
  expect(await resolveBackendRuntime({ packaged: true, appRoot: '/app/resources/app.asar', resourcesPath: '/app/resources', platform: 'linux', env: { JAVA_HOME: '/host-jdk', LLM_METER_JAVA: '/host-java' } })).toEqual({
    jarPath: '/app/resources/backend/llm-meter-backend.jar', javaCommand: '/app/resources/runtime/bin/java', bundledJava: true,
  })
})
// Validates development retains explicit Java executable configuration.
it('preserves the development Java override', async () => {
  expect((await resolveBackendRuntime({ packaged: false, appRoot: '/missing/app', resourcesPath: '/unused', env: { LLM_METER_JAVA: '/custom/java', JAVA_HOME: '/other' } })).javaCommand).toBe('/custom/java')
})
// Validates project-resolved Java remains usable for development when no environment override exists.
it('uses the prepared development runtime locator', async () => {
  const root = await mkdtemp(join(tmpdir(), 'meter-runtime-test-'))
  try {
    await mkdir(join(root, 'resources/backend'), { recursive: true })
    await writeFile(join(root, 'resources/backend/java-runtime.json'), JSON.stringify({ javaCommand: '/resolved/java' }))
    expect((await resolveBackendRuntime({ packaged: false, appRoot: root, resourcesPath: '/unused', env: {} })).javaCommand).toBe('/resolved/java')
  } finally { await rm(root, { recursive: true, force: true }) }
})
