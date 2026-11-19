import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageLoader } from '@/components/StatusViews'
import { useAuth } from '@/context/useAuth'

// Wraps routes that need a logged-in user.
export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />

  if (!user) {
    // Remember where they were going so login can send them back
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
