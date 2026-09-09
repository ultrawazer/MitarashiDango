import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router'
import toast from 'react-hot-toast'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import Footer from './components/layout/Footer'
import { useTelemetry } from './hooks/useTelemetry'
import { useDiscordPageStatus } from './hooks/useDiscordRPC'
import { useAnilistAuthCallback } from './hooks/useAnilistAuthCallback'
import { useLocalStorage } from './hooks/useLocalStorage'
import VirtualKeyboard from './components/common/VirtualKeyboard'
import { useVirtualKeyboard } from './hooks/useVirtualKeyboard'
import { useAnimePaheCookie } from './hooks/useAnimePaheCookie'
import AnimePaheCookieModal from './components/anime/AnimePaheCookieModal'

const Home = lazy(() => import('./pages/Home'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const Settings = lazy(() => import('./pages/Settings'))
const Player = lazy(() => import('./pages/Player'))
const Search = lazy(() => import('./pages/Search'))
const Asmr = lazy(() => import('./pages/Asmr'))
const Radio = lazy(() => import('./pages/Radio'))
const Tv = lazy(() => import('./pages/Tv'))
const Trackers = lazy(() => import('./pages/Trackers'))
const Insights = lazy(() => import('./pages/Insights'))
const UserMap = lazy(() => import('./pages/Map'))
const AnimeInfoPage = lazy(() => import('./pages/AnimeInfoPage'))

import { useSidebar } from './hooks/useSidebar'
import { Toaster } from 'react-hot-toast'
import TopProgressBar from './components/common/TopProgressBar'
import ErrorBoundary from './components/common/ErrorBoundary'
import { LanAuthProvider } from './contexts/LanAuthProvider'
import { useLanAuth } from './hooks/useLanAuth'
import LanAuthModal from './components/modals/LanAuthModal'

const PlayerRedirect = () => {
  const { id, episodeNumber } = useParams()
  return <Navigate to={episodeNumber ? `/watch/${id}/${episodeNumber}` : `/watch/${id}`} replace />
}

function App() {
  const {
    isOpen: animePaheOpen,
    closeModal: closeAnimePaheModal,
    onSuccess,
  } = useAnimePaheCookie()
  const { isOpen: sidebarOpen, setIsOpen } = useSidebar()
  const {
    isOpen: lanAuthOpen,
    openModal: openLanAuthModal,
    closeModal: closeLanAuthModal,
  } = useLanAuth()
  const location = useLocation()
  const virtualKeyboard = useVirtualKeyboard()
  useTelemetry()
  useDiscordPageStatus()
  useAnilistAuthCallback()

  useEffect(() => {
    fetch('/api/auth/app-status')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasPassword && !data.isAuthenticated) {
          openLanAuthModal()
        }
      })
      .catch(() => {})
  }, [openLanAuthModal])

  const [lanNoticeShown, setLanNoticeShown] = useLocalStorage<string>('lan_auth_notice_shown', '')
  useEffect(() => {
    if (!lanNoticeShown) {
      setLanNoticeShown('true')
      setTimeout(() => {
        toast(
          'Optional LAN lock is available. Set a password in Settings to protect access from other devices on your network.',
          {
            duration: 10000,
            icon: '🔒',
            style: {
              background: '#1a3a5c',
              color: '#fff',
              border: '1px solid #2a5a8c',
            },
          }
        )
      }, 3000)
    }
  }, [lanNoticeShown, setLanNoticeShown])

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

  return (
    <div className="app-container">
      <AnimePaheCookieModal
        isOpen={animePaheOpen}
        onClose={closeAnimePaheModal}
        onSuccess={onSuccess}
      />
      <LanAuthModal isOpen={lanAuthOpen} onClose={closeLanAuthModal} onSuccess={() => {}} />
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
    <LanAuthProvider>
      <App />
    </LanAuthProvider>
  )
}
