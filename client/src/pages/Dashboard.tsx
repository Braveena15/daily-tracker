import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <span className="brand">🌱 Daily Tracker</span>
        <button className="secondary" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </header>

      <section className="card">
        <h1>Welcome, {user?.name}</h1>
        <p className="subtitle">Your daily check-ins will appear here soon.</p>
      </section>
    </main>
  )
}
