module.exports = {
  appId: 'com.llmeter.personal', productName: 'LLM Meter Personal',
  executableName: 'llm-meter-personal',
  directories: { app: '.desktop-build/app', output: 'release', buildResources: 'build' },
  asar: true, npmRebuild: false, publish: null,
  files: ['dist/**', 'dist-desktop/**', 'package.json', '!**/node_modules/**'],
  extraResources: [
    { from: '.desktop-build/THIRD_PARTY_NOTICES.txt', to: 'THIRD_PARTY_NOTICES.txt' },
    { from: 'resources/backend/llm-meter-backend.jar', to: 'backend/llm-meter-backend.jar' },
    { from: '.desktop-build/runtime', to: 'runtime', filter: ['**/*'] },
  ],
  linux: { target: ['AppImage', 'tar.gz'], category: 'Utility', syncDesktopName: true, icon: 'build/icon.png',
    artifactName: 'LLM-Meter-Personal-${version}-linux-${arch}.${ext}',
    desktop: { entry: { Comment: 'Observed LLM usage from local session files', Keywords: 'LLM;usage;tokens;' } },
  },
}
