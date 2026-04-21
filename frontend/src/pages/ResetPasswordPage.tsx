import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { resetPassword } = useAuth()
  const token = searchParams.get('token') ?? ''
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async () => {
    setError(null)
    setInfo(null)
    setIsSubmitting(true)
    try {
      await resetPassword({ token, newPassword: pw })
      setInfo('Passwort aktualisiert. Weiter zum Login…')
      window.setTimeout(() => navigate('/auth', { replace: true }), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h2 className="auth-title">Passwort zurücksetzen</h2>
        <label>
          Neues Passwort
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}
        <button type="button" className="auth-primary" disabled={isSubmitting || !token} onClick={submit}>
          Speichern
        </button>
      </div>
    </div>
  )
}

