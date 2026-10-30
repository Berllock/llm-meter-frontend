import electron = require('electron')
import type { BackendState, DesktopBridge, DesktopPeriod } from '../shared/desktop-contract.js'
const { contextBridge, ipcRenderer } = electron
const bridge: DesktopBridge = {
  getBackendState: () => ipcRenderer.invoke('meter:state'),
  onBackendState: listener => {
    const receive = (_event: unknown, state: BackendState) => listener(state)
    ipcRenderer.on('meter:state-change', receive)
    return () => { ipcRenderer.removeListener('meter:state-change', receive) }
  },
  readDailyUsage: (period: DesktopPeriod, requestId: string) => ipcRenderer.invoke('meter:daily', period, requestId),
  cancelUsage: requestId => ipcRenderer.send('meter:cancel', requestId),
  restartBackend: () => ipcRenderer.invoke('meter:restart'),
  chooseSessionsFolder: () => ipcRenderer.invoke('meter:choose-source'),
}
contextBridge.exposeInMainWorld('llmMeter', bridge)
