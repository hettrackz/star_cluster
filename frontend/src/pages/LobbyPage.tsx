import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useI18n } from '../I18nContext'
import { Icon } from '../components/Icon'

const AVATARS = [
  { id: 'avatar1', url: '/avatars/avatar_technician.jpg', nameDe: 'Technikerin', nameEn: 'Technician' },
  { id: 'avatar2', url: '/avatars/avatar_wise_alien.jpg', nameDe: 'Gelehrter', nameEn: 'Scholar' },
  { id: 'avatar3', url: '/avatars/avatar_diplomat.jpg', nameDe: 'Diplomatin', nameEn: 'Diplomat' },
  { id: 'avatar4', url: '/avatars/avatar_knight.jpg', nameDe: 'Space-Ritter', nameEn: 'Space Knight' },
]

export function LobbyPage() {
  const [gameIdInput, setGameIdInput] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [radius, setRadius] = useState(3)
  const [maxRounds, setMaxRounds] = useState(30)
  const [turnLimitSec, setTurnLimitSec] = useState(300)
  const [occupiedAvatars, setOccupiedAvatars] = useState<string[]>([])
  const [friendEmail, setFriendEmail] = useState('')
  const [friends, setFriends] = useState<Array<{ id: string; email: string; name: string; avatarUrl: string | null }>>([])
  const [friendGames, setFriendGames] = useState<
    Array<{
      gameId: string
      friend: { id: string; email: string; name: string; avatarUrl: string | null }
      players: Array<{ id: string; name: string; color: string; avatarUrl: string | null }>
    }>
  >([])
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [showSetupStep, setShowSetupStep] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const handledNavErrorRef = useRef(false)
  const { backendUrl, token, user, logout, updateProfile } = useAuth()
  const { t, lang, setLang } = useI18n()

  useEffect(() => {
    if (handledNavErrorRef.current) return
    const err = (location.state as { error?: unknown } | null)?.error
    if (typeof err !== 'string' || !err) return
    handledNavErrorRef.current = true
    setLobbyError(err)
    navigate('/lobby', { replace: true, state: null })
  }, [location.state, navigate])

  useEffect(() => {
    if (!user) return
    setPlayerName(user.name)
    if (user.avatarUrl && !selectedAvatar) {
      setSelectedAvatar(user.avatarUrl)
    }
  }, [user, selectedAvatar])

  useEffect(() => {
    if (gameIdInput && gameIdInput.length > 5) {
      fetch(`${backendUrl}/api/games/${encodeURIComponent(gameIdInput)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Game not found')
          return res.json()
        })
        .then((data: { state?: { players?: Array<{ avatarUrl?: string }> } }) => {
          const occupied =
            data.state?.players
              ?.map((p) => p.avatarUrl)
              .filter((url): url is string => Boolean(url)) ?? []
          setOccupiedAvatars(occupied)
        })
        .catch(err => {
          console.error('Error fetching game data', err)
          setOccupiedAvatars([])
        })
    } else {
      setOccupiedAvatars([])
    }
  }, [gameIdInput, backendUrl, token])

  const refreshFriends = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = (await res.json()) as { friends?: Array<{ id: string; email: string; name: string; avatarUrl: string | null }> }
      setFriends(Array.isArray(data.friends) ? data.friends : [])
    } catch {
      return
    }
  }, [backendUrl, token])

  const refreshFriendGames = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/friends/open-games`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        items?: Array<{
          gameId: string
          friend: { id: string; email: string; name: string; avatarUrl: string | null }
          players: Array<{ id: string; name: string; color: string; avatarUrl: string | null }>
        }>
      }
      setFriendGames(Array.isArray(data.items) ? data.items : [])
    } catch {
      return
    }
  }, [backendUrl, token])

  useEffect(() => {
    refreshFriends()
    refreshFriendGames()
  }, [refreshFriends, refreshFriendGames])

  const handleAddFriend = async () => {
    const email = friendEmail.trim()
    if (!email) return
    try {
      setLobbyError(null)
      setIsBusy(true)
      const res = await fetch(`${backendUrl}/api/friends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        setLobbyError(await res.text())
        return
      }
      setFriendEmail('')
      await refreshFriends()
      await refreshFriendGames()
    } catch (e) {
      setLobbyError(e instanceof Error ? e.message : 'Netzwerkfehler')
    } finally {
      setIsBusy(false)
    }
  }

  const handleCreateGame = async () => {
    const name = playerName || 'Spieler'
    const avatar = selectedAvatar || user?.avatarUrl || AVATARS[0]!.url

    try {
      setLobbyError(null)
      setIsBusy(true)
      await updateProfile({ name, avatarUrl: avatar })
      const response = await fetch(`${backendUrl}/api/games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          creatorName: name,
          avatarUrl: avatar,
          radius,
          maxRounds,
          turnLimitSec,
        }),
      })

      if (!response.ok) {
        setLobbyError(await response.text())
        return
      }

      const data: { gameId: string } = await response.json()
      navigate(`/waiting/${data.gameId}`)
    } catch (err) {
      setLobbyError(err instanceof Error ? err.message : 'Netzwerkfehler')
    } finally {
      setIsBusy(false)
    }
  }

  const handleJoinGame = async () => {
    const id = gameIdInput.trim()
    if (!id) {
      setLobbyError(t('lobby.err.enterGameId'))
      return
    }
    const name = playerName || 'Spieler'
    const avatar = selectedAvatar || user?.avatarUrl || AVATARS.find((a) => !occupiedAvatars.includes(a.url))?.url || AVATARS[0]!.url

    try {
      setLobbyError(null)
      setIsBusy(true)
      await updateProfile({ name, avatarUrl: avatar })
      const response = await fetch(`${backendUrl}/api/games/${encodeURIComponent(id)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        setLobbyError(t('lobby.err.joinFailed'))
        return
      }
      navigate(`/waiting/${id}`)
    } catch (err) {
      setLobbyError(err instanceof Error ? err.message : 'Netzwerkfehler')
    } finally {
      setIsBusy(false)
    }
  }

  const effectiveAvatarUrl =
    selectedAvatar || user?.avatarUrl || AVATARS.find((a) => !occupiedAvatars.includes(a.url))?.url || AVATARS[0]!.url
  const friendGamesPreview = friendGames.slice(0, 3)

  return (
    <div className="page lobby-page">
      <div className="topbar">
        <div className="topbar-left">
          <video
            className="topbar-logo"
            src="/avatars/Logo_Animated.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-label="Star Cluster Logo"
          />
          <div className="topbar-title">{t('lobby.title')}</div>
        </div>
        <div className="topbar-right">
          <button type="button" className="lang-toggle" onClick={() => setLang(lang === 'de' ? 'en' : 'de')}>
            {lang.toUpperCase()}
          </button>
          {user?.avatarUrl ? <img className="topbar-avatar" src={user.avatarUrl} alt={user.name} /> : <div className="topbar-avatar placeholder" />}
          <button type="button" className="topbar-action" onClick={logout} title={t('lobby.logout')}>
            <Icon name="logout" />
          </button>
        </div>
      </div>
      {lobbyError && <div className="error-banner">{lobbyError}</div>}
      <div className="card lobby-card">
        {!showSetupStep ? (
          <>
            <div className="lobby-profile-row">
              <label className="lobby-profile-name">
                <span className="lobby-label">{t('lobby.displayName')}</span>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Name eingeben"
                />
              </label>
              <button
                type="button"
                className={`lobby-avatar-btn ${showAvatarPicker ? 'active' : ''}`}
                onClick={() => setShowAvatarPicker((v) => !v)}
                aria-label={t('lobby.chooseAvatar')}
              >
                <img className="lobby-avatar-img" src={effectiveAvatarUrl} alt="" />
                <span className="lobby-avatar-text">{t('lobby.chooseAvatar')}</span>
              </button>
            </div>

            {showAvatarPicker ? (
              <div className="lobby-avatar-grid" role="group" aria-label={t('lobby.chooseAvatar')}>
                {AVATARS.map((avatar) => {
                  const isOccupied = occupiedAvatars.includes(avatar.url)
                  const displayName = lang === 'en' ? avatar.nameEn : avatar.nameDe
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      className={`lobby-avatar-option ${selectedAvatar === avatar.url ? 'selected' : ''} ${isOccupied ? 'occupied' : ''}`}
                      onClick={() => {
                        if (isOccupied) return
                        setSelectedAvatar(avatar.url)
                        setShowAvatarPicker(false)
                      }}
                      disabled={isOccupied}
                      aria-label={displayName}
                    >
                      <img src={avatar.url} alt={displayName} />
                    </button>
                  )
                })}
              </div>
            ) : null}

            <div className="lobby-section-title">{lang === 'en' ? 'Game Overview' : 'Game Overview'}</div>
            <div className="lobby-overview">
              <div className="lobby-overview-meta">
                <div className="subtle-text">{lang === 'en' ? `Friends: ${friends.length}` : `Freunde: ${friends.length}`}</div>
                <button type="button" className="lobby-mini-btn" onClick={() => refreshFriendGames()} disabled={isBusy}>
                  {lang === 'en' ? 'Refresh' : 'Aktualisieren'}
                </button>
              </div>

              {friendGamesPreview.length === 0 ? (
                <div className="subtle-text">{lang === 'en' ? 'No open friend games.' : 'Keine offenen Freundes-Spiele.'}</div>
              ) : (
                <div className="lobby-overview-list">
                  {friendGamesPreview.map((g) => (
                    <div key={g.gameId} className="lobby-overview-item">
                      <div className="lobby-overview-item-left">
                        <div className="lobby-overview-title">{g.friend.name}</div>
                        <div className="lobby-overview-sub">
                          {lang === 'en' ? 'Players' : 'Spieler'}: {g.players.length} • ID: {g.gameId}
                        </div>
                      </div>
                      <button type="button" className="lobby-mini-btn" onClick={() => navigate(`/waiting/${g.gameId}`)} disabled={isBusy}>
                        {lang === 'en' ? 'Join' : 'Beitreten'}
                      </button>
                    </div>
                  ))}
                  {friendGames.length > friendGamesPreview.length ? (
                    <div className="subtle-text">
                      {lang === 'en'
                        ? `+${friendGames.length - friendGamesPreview.length} more…`
                        : `+${friendGames.length - friendGamesPreview.length} weitere…`}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="lobby-actions-row">
              <button
                type="button"
                onClick={() => {
                  setLobbyError(null)
                  setShowSetupStep(true)
                  setShowJoin(false)
                  setShowAddFriend(false)
                }}
                disabled={isBusy}
              >
                {t('lobby.create')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLobbyError(null)
                  setShowJoin((v) => !v)
                  setShowAddFriend(false)
                }}
                disabled={isBusy}
              >
                {t('lobby.join')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLobbyError(null)
                  setShowAddFriend((v) => !v)
                  setShowJoin(false)
                }}
                disabled={isBusy}
              >
                {lang === 'en' ? 'Add friends' : 'Add Friends'}
              </button>
            </div>

            {showJoin ? (
              <div className="lobby-inline-row" aria-label={t('lobby.join')}>
                <input
                  type="text"
                  value={gameIdInput}
                  onChange={(e) => setGameIdInput(e.target.value)}
                  placeholder="Game ID (z.B. ABC123)"
                />
                <button type="button" onClick={handleJoinGame} disabled={isBusy}>
                  {lang === 'en' ? 'Go' : 'Los'}
                </button>
              </div>
            ) : null}

            {showAddFriend ? (
              <div className="lobby-inline-row" aria-label={lang === 'en' ? 'Add friends' : 'Add Friends'}>
                <input
                  type="text"
                  value={friendEmail}
                  onChange={(e) => setFriendEmail(e.target.value)}
                  placeholder={lang === 'en' ? 'Friend email' : 'Email des Freundes'}
                />
                <button type="button" onClick={handleAddFriend} disabled={isBusy || !friendEmail.trim()}>
                  {lang === 'en' ? 'Add' : 'Hinzufügen'}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="lobby-section-title">{lang === 'en' ? 'Game Setup' : 'Spiel-Setup'}</div>
            <div className="lobby-setup-grid" aria-label={lang === 'en' ? 'Game Setup' : 'Spiel-Setup'}>
              <label>
                Radius
                <input type="number" min={2} max={6} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
              </label>
              <label>
                {lang === 'en' ? 'Rounds' : 'Runden'}
                <input type="number" min={5} max={50} value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))} />
              </label>
              <label>
                {lang === 'en' ? 'Round time (sec)' : 'Rundenzeit (Sek.)'}
                <input
                  type="number"
                  min={15}
                  max={600}
                  step={5}
                  value={turnLimitSec}
                  onChange={(e) => setTurnLimitSec(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="lobby-actions-row">
              <button
                type="button"
                onClick={() => {
                  setShowSetupStep(false)
                }}
                disabled={isBusy}
              >
                {lang === 'en' ? 'Back' : 'Zurück'}
              </button>
              <button type="button" onClick={handleCreateGame} disabled={isBusy}>
                {lang === 'en' ? 'Create Game' : 'Spiel erstellen'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
