import { AppShell } from './components/AppShell'

function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const dataApiUrl = import.meta.env.VITE_DATA_API_URL
  return <AppShell apiKey={apiKey} dataApiUrl={dataApiUrl} />
}

export default App
