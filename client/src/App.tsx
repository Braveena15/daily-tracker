import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { Toaster } from './components/ui/sonner'
import { AuthProvider } from './context/AuthProvider'
import { ThemeProvider } from './context/ThemeProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { Today } from './pages/Today'
import { History } from './pages/History'
import { Meals } from './pages/Meals'
import { Foods } from './pages/Foods'
import { Review } from './pages/Review'
import { Profile } from './pages/Profile'

// A "data router", which the Today page needs to warn about unsaved changes (useBlocker).
const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/today', element: <Today /> },
          { path: '/meals', element: <Meals /> },
          { path: '/foods', element: <Foods /> },
          { path: '/history', element: <History /> },
          { path: '/review', element: <Review /> },
          { path: '/profile', element: <Profile /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster position="top-center" />
    </ThemeProvider>
  )
}

export default App
