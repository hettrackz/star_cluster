import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { Turnstile } from '../components/Turnstile'
import { useI18n } from '../I18nContext'

type Mode = 'login' | 'register' | 'forgot'

export function AuthPage() {
  const navigate = useNavigate()
  const { login, register, resendVerification, forgotPassword } = useAuth()
  const { t, lang, setLang } = useI18n()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined)
  const [captchaResetNonce, setCaptchaResetNonce] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const title = useMemo(() => {
    if (mode === 'login') return t('auth.title.login')
    if (mode === 'register') return t('auth.title.register')
    return t('auth.title.forgot')
  }, [mode, t])

  const submit = async () => {
    setError(null)
    setInfo(null)
    setIsSubmitting(true)
    try {
      if (mode !== 'login' && import.meta.env.VITE_TURNSTILE_SITE_KEY && !captchaToken) {
        setError(lang === 'de' ? 'Bitte Captcha bestätigen.' : 'Please complete the captcha.')
        return
      }
      if (mode === 'login') {
        setInfo(lang === 'de' ? 'Login läuft…' : 'Logging in…')
        await login({ email, password })
        navigate('/lobby', { replace: true })
        return
      }
      if (mode === 'register') {
        setInfo(lang === 'de' ? 'Registrierung wird gesendet…' : 'Sending registration…')
        const res = await register({ email, password, name, captchaToken })
        setInfo(lang === 'de' ? 'Registrierungs-Email wurde verschickt. Bitte bestätige deine Email-Adresse.' : 'Verification email sent. Please confirm your email address.')
        if (res.verifyUrl) {
          setInfo(lang === 'de' ? `Bitte bestätige deine Email-Adresse. Dev-Link: ${res.verifyUrl}` : `Please confirm your email. Dev link: ${res.verifyUrl}`)
        }
        setCaptchaToken(undefined)
        setCaptchaResetNonce((v) => v + 1)
        return
      }
      setInfo(lang === 'de' ? 'Reset-Link wird angefordert…' : 'Requesting reset link…')
      const res = await forgotPassword({ email, captchaToken })
      setInfo(lang === 'de' ? 'Wenn die Email existiert, wurde ein Reset-Link versendet.' : 'If the email exists, a reset link has been sent.')
      if (res.resetUrl) {
        setInfo(lang === 'de' ? `Reset-Link (Dev): ${res.resetUrl}` : `Reset link (dev): ${res.resetUrl}`)
      }
      setCaptchaToken(undefined)
      setCaptchaResetNonce((v) => v + 1)
    } catch (e) {
      const msgRaw = e instanceof Error ? e.message : 'Unbekannter Fehler'
      const msg = String(msgRaw)
      if (msg.toLowerCase().includes('email not verified')) {
        setError('Email ist noch nicht bestätigt.')
        try {
          setInfo(lang === 'de' ? 'Sende neue Bestätigungs-Email…' : 'Sending new verification email…')
          const res = await resendVerification({ email, captchaToken })
          if (res.verifyUrl) {
            setInfo(`Bestätigungs-Link (Dev): ${res.verifyUrl}`)
          } else {
            setInfo('Wir haben dir eine neue Bestätigungs-Email gesendet.')
          }
          setCaptchaToken(undefined)
          setCaptchaResetNonce((v) => v + 1)
        } catch {
          setInfo(lang === 'de' ? 'Bestätigungs-Email konnte nicht gesendet werden.' : 'Could not send verification email.')
        }
      } else {
        if (msg.toLowerCase().includes('email service unavailable')) {
          setError(lang === 'de' ? 'Email-Service ist aktuell nicht verfügbar. Bitte später erneut versuchen.' : 'Email service is currently unavailable. Please try again later.')
        } else if (msg.toLowerCase().includes('captcha failed')) {
          setError(lang === 'de' ? `Captcha fehlgeschlagen. Bitte erneut versuchen. (${msg})` : `Captcha failed. Please try again. (${msg})`)
        } else {
          setError(msg)
        }
        if (mode !== 'login' && import.meta.env.VITE_TURNSTILE_SITE_KEY) {
          setCaptchaToken(undefined)
          setCaptchaResetNonce((v) => v + 1)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <video
          className="auth-logo"
          src="/avatars/Logo_Animated.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-label="Star Cluster Logo"
        />

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            {t('auth.login')}
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            {t('auth.register')}
          </button>
          <button type="button" className={mode === 'forgot' ? 'active' : ''} onClick={() => setMode('forgot')}>
            {t('auth.reset')}
          </button>
        </div>

        <div className="auth-header-row">
          <h2 className="auth-title">{title}</h2>
          <button type="button" className="lang-toggle" onClick={() => setLang(lang === 'de' ? 'en' : 'de')}>
            {lang.toUpperCase()}
          </button>
        </div>

        {mode === 'register' && (
          <label>
            {t('auth.name')}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" autoComplete="name" />
          </label>
        )}

        <label>
          {t('auth.email')}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            autoComplete="email"
          />
        </label>

        {mode !== 'forgot' && (
          <label>
            {t('auth.password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
        )}

        <div className="auth-captcha">
          <Turnstile onToken={(t) => setCaptchaToken(t || undefined)} resetNonce={captchaResetNonce} />
        </div>

        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}

        <button type="button" className="auth-primary" disabled={isSubmitting} onClick={submit}>
          {mode === 'login' ? t('auth.submit.login') : mode === 'register' ? t('auth.submit.register') : t('auth.submit.reset')}
        </button>
      </div>
    </div>
  )
}
