import { useEffect, useState } from 'react'

// The shape of the JSON that GET /api/health sends back
type HealthResponse = {
  status: string
  db: string
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<HealthResponse>
      })
      .then(setHealth)
      .catch(() => setError(true))
  }, [])

  return (
    <main>
      <h1>🌱 Daily Tracker</h1>
      {error ? (
        <p style={{ color: 'red' }}>Can't reach the server</p>
      ) : health ? (
        <p>
          Server: {health.status} · Database: {health.db}
        </p>
      ) : (
        <p>Checking server…</p>
      )}
    </main>
  )
}

export default App
