export type BackendState = {
  phase: 'starting' | 'ready' | 'error' | 'stopped' | 'needs-source'
  message: string
  revision: number
  generation: string
}
export type DesktopAgent = 'CODEX' | 'ANTIGRAVITY'
export type AgentSources = Partial<Record<DesktopAgent, string>>
export type DesktopPeriod = { from: string; to: string; zone: string; provider?: DesktopAgent }
export type DesktopResponse = { status: number; body: unknown }
export type DesktopBridge = {
  getBackendState(): Promise<BackendState>
  onBackendState(listener: (state: BackendState) => void): () => void
  readDailyUsage(period: DesktopPeriod, requestId: string): Promise<DesktopResponse>
  cancelUsage(requestId: string): void
  restartBackend(): Promise<void>
  chooseSessionsFolder(provider?: DesktopAgent): Promise<void>
}
