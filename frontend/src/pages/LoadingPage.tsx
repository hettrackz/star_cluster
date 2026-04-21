import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useI18n } from '../I18nContext'

const DURATION_MS = 1000

export function LoadingPage() {
  const navigate = useNavigate()
  const { isReady, token } = useAuth()
  const { t } = useI18n()
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const id = window.setInterval(() => {
      const elapsed = Date.now() - start
      const next = Math.min(1, elapsed / DURATION_MS)
      setProgress(next)
      if (next >= 1) {
        window.clearInterval(id)
      }
    }, 50)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!isReady) return
    const id = window.setTimeout(() => {
      if (token) navigate('/lobby', { replace: true })
      else navigate('/auth', { replace: true })
    }, DURATION_MS)
    return () => window.clearTimeout(id)
  }, [isReady, token, navigate])

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <video
          className="loading-logo"
          src="/avatars/Logo_Animated.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-label={t('loading.aria')}
        />
        <div className="loading-bar">
          <div className="loading-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
    </div>
  )
}
