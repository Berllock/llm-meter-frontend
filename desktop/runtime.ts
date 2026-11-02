import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type RuntimeOptions = { packaged: boolean; appRoot: string; resourcesPath: string; platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv }
export async function resolveBackendRuntime(options: RuntimeOptions) {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  if (options.packaged) {
    return {
      jarPath: join(options.resourcesPath, 'backend', 'llm-meter-backend.jar'),
      javaCommand: join(options.resourcesPath, 'runtime', 'bin', platform === 'win32' ? 'java.exe' : 'java'),
      bundledJava: true,
    }
  }
  let preparedJava: string | undefined
  try {
    const config = JSON.parse(await readFile(join(options.appRoot, 'resources/backend/java-runtime.json'), 'utf8')) as { javaCommand?: unknown }
    if (typeof config.javaCommand === 'string') preparedJava = config.javaCommand
  } catch { /* Development may use an explicit runtime or the system Java command. */ }
  return {
    jarPath: join(options.appRoot, 'resources/backend/llm-meter-backend.jar'),
    javaCommand: env.LLM_METER_JAVA || (env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', platform === 'win32' ? 'java.exe' : 'java') : preparedJava || 'java'),
    bundledJava: false,
  }
}
