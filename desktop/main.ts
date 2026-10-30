import { app, BrowserWindow, dialog, ipcMain, Menu, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BackendManager } from './backend.js'
import { readSource, saveSource } from './settings.js'

app.setName('LLM Meter Personal')
if (!app.isPackaged && process.env.LLM_METER_USER_DATA_DIR) {
  mkdirSync(process.env.LLM_METER_USER_DATA_DIR, { recursive: true })
  app.setPath('userData', process.env.LLM_METER_USER_DATA_DIR)
}
let window: BrowserWindow | null = null
let backend: BackendManager
let source = ''
let quitting = false
let operation = Promise.resolve()
const requests = new Map<string, AbortController>()
const page = pathToFileURL(join(app.getAppPath(), 'dist', 'index.html')).href
function trusted(event: IpcMainInvokeEvent | IpcMainEvent) {
  return !!window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame
    && event.senderFrame.url.split('#')[0] === page
}
function requireTrusted(event: IpcMainInvokeEvent) { if (!trusted(event)) throw new Error('Request unavailable') }
function serialize(action: () => Promise<void>) {
  operation = operation.then(async () => { if (!quitting) await action() }).catch(() => {
    if (window && !quitting) void dialog.showMessageBox(window, { type: 'error', message: 'The desktop operation could not be completed. Please try again.' })
  })
  return operation
}
async function restart() { await backend.stop(); if (!quitting) await backend.start(source) }
async function chooseSource() {
  if (!window) return
  const result = await dialog.showOpenDialog(window, { title: 'Choose Codex sessions folder', properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths[0] || quitting) return
  await saveSource(app.getPath('userData'), result.filePaths[0])
  source = result.filePaths[0]
  await restart()
}
function registerBridge() {
  ipcMain.handle('meter:state', event => { requireTrusted(event); return backend.state })
  ipcMain.handle('meter:restart', event => { requireTrusted(event); return serialize(restart) })
  ipcMain.handle('meter:choose-source', event => { requireTrusted(event); return serialize(chooseSource) })
  ipcMain.handle('meter:daily', async (event, period: unknown, id: unknown) => {
    requireTrusted(event)
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id) || requests.has(id) || requests.size >= 8) return { status: 0, body: null }
    const controller = new AbortController()
    requests.set(id, controller)
    try { return await backend.readDaily(period, controller.signal) } finally { requests.delete(id) }
  })
  ipcMain.on('meter:cancel', (event, id: unknown) => { if (trusted(event) && typeof id === 'string') requests.get(id)?.abort() })
  backend.subscribe(state => { if (window && !window.isDestroyed()) window.webContents.send('meter:state-change', state) })
}
function createWindow() {
  window = new BrowserWindow({ width: 1440, height: 1000, minWidth: 760, minHeight: 600, show: false, backgroundColor: '#f6f7fb',
    webPreferences: { preload: join(app.getAppPath(), 'dist-desktop', 'desktop', 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false, backgroundThrottling: false },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => { if (url.split('#')[0] !== page) event.preventDefault() })
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.once('ready-to-show', () => { if (process.env.LLM_METER_DESKTOP_HIDE_WINDOW !== '1') window?.show() })
  window.on('closed', () => { window = null })
  void window.loadURL(page)
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.show(); window?.focus() })
  app.whenReady().then(async () => {
    const resources = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
    let preparedJava: string | undefined
    if (!app.isPackaged) {
      try {
        const config = JSON.parse(await readFile(join(resources, 'backend/java-runtime.json'), 'utf8')) as { javaCommand?: unknown }
        if (typeof config.javaCommand === 'string') preparedJava = config.javaCommand
      } catch { /* Use explicit environment settings or the system Java command. */ }
    }
    backend = new BackendManager({
      jarPath: app.isPackaged ? join(process.resourcesPath, 'backend', 'llm-meter-backend.jar') : join(app.getAppPath(), 'resources', 'backend', 'llm-meter-backend.jar'),
      javaCommand: process.env.LLM_METER_JAVA || (process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : preparedJava || 'java'),
    })
    registerBridge()
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'File', submenu: [
        { label: 'Choose sessions folder…', click: () => { void serialize(chooseSource) } },
        { label: 'Restart local service', click: () => { void serialize(restart) } }, { type: 'separator' }, { role: 'quit' },
      ] },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    ]))
    createWindow()
    source = (!app.isPackaged && process.env.LLM_METER_SESSIONS_DIRECTORY) || await readSource(app.getPath('userData')) || join(homedir(), '.codex', 'sessions')
    if (!quitting) await serialize(() => backend.start(source))
  }).catch(() => { dialog.showErrorBox('LLM Meter', 'The desktop application could not be initialized.'); app.quit() })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', event => {
    if (quitting) return
    event.preventDefault(); quitting = true
    for (const controller of requests.values()) controller.abort()
    void (backend?.stop() ?? Promise.resolve()).then(() => app.quit(), () => app.quit())
  })
  process.on('SIGINT', () => app.quit())
  process.on('SIGTERM', () => app.quit())
}
