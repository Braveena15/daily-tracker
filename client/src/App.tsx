import { Suspense } from 'react'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { FullPageLoader } from './components/StatusViews'
import { lazyPage } from './lib/lazyPage'
import { Toaster } from './components/ui/sonner'
import { PwaUpdater } from './components/PwaUpdater'
import { AuthProvider } from './context/AuthProvider'
import { ThemeProvider } from './context/ThemeProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'

// Each page is its own file that loads when you first open it, so the app starts faster
// (the chart library, for example, only loads on pages with charts).
const Login = lazyPage(() => import('./pages/Login').then((m) => m.Login))
const Register = lazyPage(() => import('./pages/Register').then((m) => m.Register))
const Dashboard = lazyPage(() => import('./pages/Dashboard').then((m) => m.Dashboard))
const Today = lazyPage(() => import('./pages/Today').then((m) => m.Today))
const History = lazyPage(() => import('./pages/History').then((m) => m.History))
const DayDetail = lazyPage(() => import('./pages/DayDetail').then((m) => m.DayDetail))
const Meals = lazyPage(() => import('./pages/Meals').then((m) => m.Meals))
const Foods = lazyPage(() => import('./pages/Foods').then((m) => m.Foods))
const Review = lazyPage(() => import('./pages/Review').then((m) => m.Review))
const Mind = lazyPage(() => import('./pages/Mind').then((m) => m.Mind))
const Diary = lazyPage(() => import('./pages/Diary').then((m) => m.Diary))
const DiaryEditor = lazyPage(() => import('./pages/DiaryEditor').then((m) => m.DiaryEditor))
const Thoughts = lazyPage(() => import('./pages/Thoughts').then((m) => m.Thoughts))
const ThoughtFlow = lazyPage(() => import('./pages/ThoughtFlow').then((m) => m.ThoughtFlow))
const Lift = lazyPage(() => import('./pages/Lift').then((m) => m.Lift))
const Purpose = lazyPage(() => import('./pages/Purpose').then((m) => m.Purpose))
const Motivation = lazyPage(() => import('./pages/Motivation').then((m) => m.Motivation))
const Profile = lazyPage(() => import('./pages/Profile').then((m) => m.Profile))

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
        {/* Login and Register (the logged-in pages have their own loading view inside the layout) */}
        <Suspense fallback={<FullPageLoader />}>
          <RouterProvider router={router} />
        </Suspense>
      </AuthProvider>
      <Toaster position="top-center" />
      <PwaUpdater />
    </ThemeProvider>
  )
}

export default App
