import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UsageDashboard } from '../features/usage/components/UsageDashboard'

const queryClient = new QueryClient()
export function App() {
  return <QueryClientProvider client={queryClient}><UsageDashboard /></QueryClientProvider>
}
