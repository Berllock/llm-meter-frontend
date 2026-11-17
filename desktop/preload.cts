import electron = require('electron')
import type { BackendState, DesktopBridge, DesktopPeriod, QuotaNotificationState } from '../shared/desktop-contract.js'
const { contextBridge, ipcRenderer } = electron
const bridge: DesktopBridge = {
  getQuotaNotifications: () => ipcRenderer.invoke('meter:quota-notifications-state'),
  setQuotaNotifications: enabled => ipcRenderer.invoke('meter:quota-notifications', enabled),
  onQuotaNotifications: listener => {
    const receive = (_event: unknown, state: QuotaNotificationState) => listener(state)
    ipcRenderer.on('meter:quota-notifications-change', receive)
    return () => { ipcRenderer.removeListener('meter:quota-notifications-change', receive) }
  },
  getBackendState: () => ipcRenderer.invoke('meter:state'),
  onBackendState: listener => {
    const receive = (_event: unknown, state: BackendState) => listener(state)
    ipcRenderer.on('meter:state-change', receive)
    return () => { ipcRenderer.removeListener('meter:state-change', receive) }
  },
  readDailyUsage: (period: DesktopPeriod, requestId: string) => ipcRenderer.invoke('meter:daily', period, requestId),
  readQuotaHistory: (provider, requestId) => ipcRenderer.invoke('meter:quota-history', provider, requestId),
  readQuota: (provider, requestId) => ipcRenderer.invoke('meter:quota', provider, requestId),
  cancelUsage: requestId => ipcRenderer.send('meter:cancel', requestId),
  setKiroAccountQuotaEnabled: enabled => ipcRenderer.invoke('meter:kiro-account-quota', enabled),
  setAntigravityIdeSharedAccount: enabled => ipcRenderer.invoke('meter:antigravity-ide-shared-account', enabled),
  setAntigravityIdeQuotaEnabled: enabled => ipcRenderer.invoke('meter:antigravity-ide-quota', enabled),
  restartBackend: () => ipcRenderer.invoke('meter:restart'),
  chooseSessionsFolder: provider => ipcRenderer.invoke('meter:choose-source', provider ?? 'CODEX'),
}
contextBridge.exposeInMainWorld('llmMeter', bridge)
