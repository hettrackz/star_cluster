import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { AuthPage } from './pages/AuthPage'
import { LoadingPage } from './pages/LoadingPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { LobbyPage } from './pages/LobbyPage'
import { GamePage } from './pages/GamePage'
import './App.css'
import { useEffect, useState } from 'react'
import { useI18n } from './I18nContext'
import { Icon } from './components/Icon'

function Protected({ children }: { children: React.ReactNode }) {
  const { token, isReady } = useAuth()
  if (!isReady) return null
  if (!token) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function App() {
  const { t } = useI18n()
  const [needsLandscape, setNeedsLandscape] = useState(false)

  useEffect(() => {
    const update = () => {
      const isSmall = window.innerWidth <= 1024
      const isPortrait = window.matchMedia('(orientation: portrait)').matches
      setNeedsLandscape(isSmall && isPortrait)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return (
    <BrowserRouter>
      {needsLandscape && (
        <div className="rotate-overlay">
          <div className="rotate-card">
            <div className="rotate-icon"><Icon name="screen_rotation" /></div>
            <div className="rotate-text">{t('app.rotate')}</div>
          </div>
        </div>
      )}
      <Routes>
        <Route path="/" element={<LoadingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/lobby"
          element={
            <Protected>
              <LobbyPage />
            </Protected>
          }
        />
        <Route
          path="/game/:gameId"
          element={
            <Protected>
              <GamePage />
            </Protected>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
