import { createContext, useContext, useMemo, useState } from 'react'

export type Lang = 'de' | 'en'

type Dictionary = Record<string, { de: string; en: string }>

const DICT: Dictionary = {
  'app.rotate': { de: 'Bitte Gerät drehen (Landscape)', en: 'Please rotate your device (landscape)' },
  'auth.login': { de: 'Login', en: 'Login' },
  'auth.register': { de: 'Registrieren', en: 'Register' },
  'auth.reset': { de: 'Reset', en: 'Reset' },
  'auth.title.login': { de: 'Login', en: 'Login' },
  'auth.title.register': { de: 'Registrieren', en: 'Create account' },
  'auth.title.forgot': { de: 'Passwort vergessen', en: 'Forgot password' },
  'auth.name': { de: 'Name', en: 'Name' },
  'auth.email': { de: 'Email', en: 'Email' },
  'auth.password': { de: 'Passwort', en: 'Password' },
  'auth.submit.login': { de: 'Einloggen', en: 'Sign in' },
  'auth.submit.register': { de: 'Registrieren', en: 'Create account' },
  'auth.submit.reset': { de: 'Link senden', en: 'Send link' },
  'loading.aria': { de: 'Star Cluster Logo', en: 'Star Cluster logo' },
  'lobby.title': { de: 'Star Cluster', en: 'Star Cluster' },
  'lobby.displayName': { de: 'Anzeigename', en: 'Display name' },
  'lobby.chooseAvatar': { de: 'Wähle deinen Avatar', en: 'Choose your avatar' },
  'lobby.create': { de: 'Neues Spiel erstellen', en: 'Create new game' },
  'lobby.gameId': { de: 'Spiel-ID', en: 'Game ID' },
  'lobby.join': { de: 'Spiel beitreten', en: 'Join game' },
  'lobby.logout': { de: 'Logout', en: 'Logout' },
  'lobby.err.enterGameId': { de: 'Bitte eine Spiel-ID eingeben.', en: 'Please enter a game ID.' },
  'lobby.err.joinFailed': { de: 'Beitreten fehlgeschlagen.', en: 'Failed to join the game.' },
  'game.exit': { de: 'Spiel verlassen', en: 'Exit game' },
  'game.turn': { de: 'Am Zug', en: 'Turn' },
  'game.dice': { de: 'Würfeln', en: 'Roll dice' },
  'game.skip': { de: 'Zug überspringen', en: 'Skip turn' },
  'game.chat': { de: 'Chat', en: 'Chat' },
}

type I18nContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: keyof typeof DICT) => string
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

const STORAGE_KEY = 'star_cluster_lang'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'en' || stored === 'de' ? stored : 'de'
  })

  const value = useMemo<I18nContextValue>(() => {
    const setLang = (next: Lang) => {
      localStorage.setItem(STORAGE_KEY, next)
      setLangState(next)
    }
    const t = (key: keyof typeof DICT) => DICT[key][lang]
    return { lang, setLang, t }
  }, [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
