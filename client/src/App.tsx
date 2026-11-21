import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { Toaster } from './components/ui/sonner'
import { PwaUpdater } from './components/PwaUpdater'
import { AuthProvider } from './context/AuthProvider'
import { ThemeProvider } from './context/ThemeProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { Today } from './pages/Today'
import { History } from './pages/History'
import { DayDetail } from './pages/DayDetail'
import { Meals } from './pages/Meals'
import { Foods } from './pages/Foods'
import { Review } from './pages/Review'
import { Mind } from './pages/Mind'
import { Diary } from './pages/Diary'
import { DiaryEditor } from './pages/DiaryEditor'
import { Thoughts } from './pages/Thoughts'
import { ThoughtFlow } from './pages/ThoughtFlow'
import { Lift } from './pages/Lift'
import { Purpose } from './pages/Purpose'
import { Motivation } from './pages/Motivation'
import { Profile } from './pages/Profile'

// A "data router" (createBrowserRouter), so pages can use the data APIs such as useBlocker.
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
          { path: '/history/:date', element: <DayDetail /> },
          { path: '/review', element: <Review /> },
          { path: '/mind', element: <Mind /> },
          { path: '/diary', element: <Diary /> },
          { path: '/diary/new', element: <DiaryEditor /> },
          { path: '/diary/:id', element: <DiaryEditor /> },
          { path: '/thoughts', element: <Thoughts /> },
          // One route for "new" and existing logs, so saving partway keeps your place
          { path: '/thoughts/:id', element: <ThoughtFlow /> },
          { path: '/lift', element: <Lift /> },
          { path: '/purpose', element: <Purpose /> },
          { path: '/motivation', element: <Motivation /> },
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
      <PwaUpdater />
    </ThemeProvider>
  )
}

export default App
