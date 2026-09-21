import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router'
import { Toaster } from 'react-hot-toast'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import Footer from './components/layout/Footer'
import { useTelemetry } from './hooks/useTelemetry'
import { useAnilistAuthCallback } from './hooks/useAnilistAuthCallback'
import VirtualKeyboard from './components/common/VirtualKeyboard'
import { useVirtualKeyboard } from './hooks/useVirtualKeyboard'
import { useSidebar } from './hooks/useSidebar'
import TopProgressBar from './components/common/TopProgressBar'
import ErrorBoundary from './components/common/ErrorBoundary'
import { AuthProvider } from './contexts/AuthProvider'
import { useAuth } from './contexts/AuthContext'

const Home = lazy(() => import('./pages/Home'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const Settings = lazy(() => import('./pages/Settings'))
const UserSettings = lazy(() => import('./pages/UserSettings'))
const Login = lazy(() => import('./pages/Login'))
const Setup = lazy(() => import('./pages/Setup'))
const Player = lazy(() => import('./pages/Player'))
const Search = lazy(() => import('./pages/Search'))
const Asmr = lazy(() => import('./pages/Asmr'))
const Radio = lazy(() => import('./pages/Radio'))
const Tv = lazy(() => import('./pages/Tv'))
const Trackers = lazy(() => import('./pages/Trackers'))
const Insights = lazy(() => import('./pages/Insights'))
const UserMap = lazy(() => import('./pages/Map'))
const AnimeInfoPage = lazy(() => import('./pages/AnimeInfoPage'))

const PlayerRedirect = () => {
  const { id, episodeNumber } = useParams()
  return <Navigate to={episodeNumber ? `/watch/${id}/${episodeNumber}` : `/watch/${id}`} replace />
}

function App() {
  const { isOpen: sidebarOpen, setIsOpen } = useSidebar()
  const { isAuthenticated, isSetup, isLoading } = useAuth()
  const location = useLocation()
  const virtualKeyboard = useVirtualKeyboard()
  useTelemetry()
  useAnilistAuthCallback()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (sidebarOpen && event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (sidebarOpen) {
      document.body.classList.add('sidebar-open')
    } else {
      document.body.classList.remove('sidebar-open')
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      document.body.classList.remove('sidebar-open')
    }
  }, [sidebarOpen, setIsOpen])

  if (isLoading) {
    return <TopProgressBar />
  }

  // Not set up yet: redirect to /setup
  if (!isSetup) {
    return (
      <Suspense fallback={<TopProgressBar />}>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </Suspense>
    )
  }

  // Set up, but not authenticated: redirect to /login
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<TopProgressBar />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    )
  }

  // Authenticated user trying to visit /login or /setup: redirect to /
  if (location.pathname === '/login' || location.pathname === '/setup') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="app-container">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
          },
          success: {
            style: {
              background: 'var(--accent)',
              color: '#fff',
            },
            iconTheme: {
              primary: '#fff',
              secondary: 'var(--accent)',
            },
          },
          error: {
            style: {
              background: 'rgba(153, 42, 42, 0.95)',
              color: '#fff',
            },
          },
        }}
      />
      <Header />
      <Sidebar />
      <main className="main-content">
        <ErrorBoundary>
          <Suspense fallback={<TopProgressBar />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/watchlist/:filter?" element={<Watchlist />} />
              <Route path="/search" element={<Search />} />
              <Route path="/asmr" element={<Asmr />} />
              <Route path="/asmr/:rj" element={<Asmr />} />
              <Route path="/radio" element={<Radio />} />
              <Route path="/tv" element={<Tv />} />
              <Route path="/tv/:id" element={<Tv />} />
              <Route path="/user-settings" element={<UserSettings />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/trackers" element={<Trackers />} />
              <Route path="/mal" element={<Navigate to="/trackers" replace />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/map" element={<UserMap />} />
              <Route path="/anime/:id" element={<AnimeInfoPage />} />
              <Route path="/watch/:id" element={<Player />} />
              <Route path="/watch/:id/:episodeNumber" element={<Player />} />
              <Route path="/player/:id" element={<PlayerRedirect />} />
              <Route path="/player/:id/:episodeNumber" element={<PlayerRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <VirtualKeyboard
        activeInputRef={virtualKeyboard.activeInputRef}
        isVisible={virtualKeyboard.isVisible}
        onClose={virtualKeyboard.hide}
      />
    </div>
  )
}

export default function AppWithProviders() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}
