import type { DesktopBridge } from '../shared/desktop-contract'
declare global { interface Window { llmMeter?: DesktopBridge } }
