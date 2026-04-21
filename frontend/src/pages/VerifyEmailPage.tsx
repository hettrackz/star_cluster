import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { verifyEmail } = useAuth()
  const token = searchParams.get('token') ?? ''
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [errorText, setErrorText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token) {
        setStatus('error')
        return
      }
      try {
        await verifyEmail({ token })
        if (!cancelled) {
          setStatus('ok')
          window.setTimeout(() => navigate('/auth', { replace: true }), 800)
        }
      } catch {
        if (!cancelled) {
          setErrorText('Bestätigungslink ist ungültig oder abgelaufen.')
          setStatus('error')
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [token, verifyEmail, navigate])

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h2 className="auth-title">Email bestätigen</h2>
        {status === 'loading' && <p>Bitte warten…</p>}
        {status === 'ok' && <p>Bestätigt. Weiter zum Login…</p>}
        {status === 'error' && <p>{errorText ?? 'Link ungültig oder abgelaufen.'}</p>}
      </div>
    </div>
  )
}
