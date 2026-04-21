import { useEffect, useId, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        params: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

export function Turnstile({ onToken, resetNonce }: { onToken: (token: string) => void; resetNonce?: number }) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  const containerId = useId().replace(/:/g, '')
  const widgetIdRef = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  useEffect(() => {
    if (!siteKey) return
    const check = () => {
      if (window.turnstile?.render) {
        setIsReady(true)
        return
      }
      window.setTimeout(check, 50)
    }
    check()
  }, [siteKey])

  useEffect(() => {
    if (!siteKey) return
    if (!isReady) return
    const container = document.getElementById(containerId)
    if (!container) return

    const widgetId = window.turnstile!.render(container, {
      sitekey: siteKey,
      callback: (token) => onTokenRef.current(token),
      'expired-callback': () => onTokenRef.current(''),
      'error-callback': () => onTokenRef.current(''),
    })
    widgetIdRef.current = widgetId

    return () => {
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [siteKey, isReady, containerId])

  useEffect(() => {
    if (!siteKey) return
    if (!isReady) return
    if (!widgetIdRef.current) return
    if (typeof resetNonce !== 'number') return
    window.turnstile?.reset(widgetIdRef.current)
  }, [resetNonce, siteKey, isReady])

  if (!siteKey) return null

  return <div id={containerId} />
}
