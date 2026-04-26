import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type AuthUser = {
  id: string
  email: string
  name: string
  avatarUrl?: string | null | undefined
}

type AuthContextValue = {
  backendUrl: string
  token: string | null
  user: AuthUser | null
  isReady: boolean
  login: (params: { email: string; password: string }) => Promise<void>
  register: (params: { email: string; password: string; name: string; avatarUrl?: string; captchaToken?: string }) => Promise<{ verifyUrl?: string | null }>
  updateProfile: (params: { name?: string; avatarUrl?: string }) => Promise<void>
  logout: () => void
  resendVerification: (params: { email: string; captchaToken?: string }) => Promise<{ verifyUrl?: string | null }>
  forgotPassword: (params: { email: string; captchaToken?: string }) => Promise<{ resetUrl?: string | null }>
  resetPassword: (params: { token: string; newPassword: string }) => Promise<void>
  verifyEmail: (params: { token: string }) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const STORAGE_KEY = 'star_cluster_auth_token'

function getBackendUrl() {
  const configured = import.meta.env.VITE_BACKEND_URL
  if (configured) return String(configured)

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  if (isLocalhost) return 'http://localhost:4000'

  if (import.meta.env.DEV) return 'http://localhost:4000'
  return window.location.origin
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const text = await res.text()
  const data = text ? (JSON.parse(text) as T) : ({} as T)
  if (!res.ok) {
    const message =
      typeof (data as unknown as { error?: unknown }).error === 'string'
        ? (data as unknown as { error: string }).error
        : res.statusText
    throw new Error(String(message))
  }
  return data
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const backendUrl = getBackendUrl()
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token) {
        if (!cancelled) setIsReady(true)
        return
      }
      try {
        const data = await fetchJson<{ user: AuthUser }>(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!cancelled) {
          setUser(data.user)
          setIsReady(true)
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
        if (!cancelled) {
          setToken(null)
          setUser(null)
          setIsReady(true)
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [backendUrl, token])

  const value: AuthContextValue = useMemo(
    () => ({
      backendUrl,
      token,
      user,
      isReady,
      login: async ({ email, password }) => {
        const data = await fetchJson<{ token: string; user: AuthUser }>(`${backendUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        localStorage.setItem(STORAGE_KEY, data.token)
        setToken(data.token)
        setUser(data.user)
      },
      register: async ({ email, password, name, avatarUrl, captchaToken }) => {
        const data = await fetchJson<{ ok: true; verifyUrl?: string | null }>(`${backendUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, avatarUrl, captchaToken }),
        })
        return { verifyUrl: data.verifyUrl }
      },
      updateProfile: async ({ name, avatarUrl }) => {
        if (!token) return
        const data = await fetchJson<{ user: AuthUser }>(`${backendUrl}/api/auth/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, avatarUrl }),
        })
        setUser(data.user)
      },
      logout: () => {
        localStorage.removeItem(STORAGE_KEY)
        setToken(null)
        setUser(null)
      },
      resendVerification: async ({ email, captchaToken }) => {
        const data = await fetchJson<{ ok: true; verifyUrl?: string | null }>(`${backendUrl}/api/auth/resend-verification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, captchaToken }),
        })
        return { verifyUrl: data.verifyUrl }
      },
      forgotPassword: async ({ email, captchaToken }) => {
        const data = await fetchJson<{ ok: true; resetUrl?: string | null }>(`${backendUrl}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, captchaToken }),
        })
        return { resetUrl: data.resetUrl }
      },
      resetPassword: async ({ token, newPassword }) => {
        await fetchJson<{ ok: true }>(`${backendUrl}/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword }),
        })
      },
      verifyEmail: async ({ token }) => {
        await fetchJson<{ ok: true }>(`${backendUrl}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      },
    }),
    [backendUrl, token, user, isReady],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return ctx
}
