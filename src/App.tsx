import { AppShell } from './components/AppShell'

function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  return <AppShell apiKey={apiKey} />
}

export default App
