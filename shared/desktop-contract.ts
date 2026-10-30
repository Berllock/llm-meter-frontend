export type BackendState = {
  phase: 'starting' | 'ready' | 'error' | 'stopped' | 'needs-source'
  message: string
  revision: number
  generation: string
}
export type DesktopPeriod = { from: string; to: string; zone: string }
export type DesktopResponse = { status: number; body: unknown }
export type DesktopBridge = {
  getBackendState(): Promise<BackendState>
  onBackendState(listener: (state: BackendState) => void): () => void
  readDailyUsage(period: DesktopPeriod, requestId: string): Promise<DesktopResponse>
  cancelUsage(requestId: string): void
  restartBackend(): Promise<void>
  chooseSessionsFolder(): Promise<void>
}
