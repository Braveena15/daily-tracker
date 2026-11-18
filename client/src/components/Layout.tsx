import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

// Page frame for logged-in pages: nav bar on top, current page below.
export function Layout() {
  const { logout } = useAuth()
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
    <div className="app-shell">
      <nav className="navbar">
        <span className="brand">🌱 Daily Tracker</span>
        <div className="nav-links">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/profile">Profile</NavLink>
          <button className="secondary" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      </nav>

      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
