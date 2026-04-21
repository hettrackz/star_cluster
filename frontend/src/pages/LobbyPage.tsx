import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const [botCount, setBotCount] = useState(3)
  const [radius, setRadius] = useState(3)
  const [maxRounds, setMaxRounds] = useState(15)
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
  const navigate = useNavigate()
  const { backendUrl, token, user, logout, updateProfile } = useAuth()
  const { t, lang, setLang } = useI18n()

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
    const avatar = selectedAvatar || AVATARS[0]!.url

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
          botCount,
          radius,
          maxRounds,
        }),
      })

      if (!response.ok) {
        setLobbyError(await response.text())
        return
      }

      const data: { gameId: string } = await response.json()
      navigate(`/game/${data.gameId}`)
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
    const avatar = selectedAvatar || AVATARS.find(a => !occupiedAvatars.includes(a.url))?.url || AVATARS[0]!.url

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
      navigate(`/game/${id}`)
    } catch (err) {
      setLobbyError(err instanceof Error ? err.message : 'Netzwerkfehler')
    } finally {
      setIsBusy(false)
    }
  }

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
      <div className="card">
        <label>
          {t('lobby.displayName')}
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Name eingeben"
          />
        </label>
      </div>

      <div className="card">
        <h3>{t('lobby.chooseAvatar')}</h3>
        <div className="avatar-selection">
          {AVATARS.map((avatar) => {
            const isOccupied = occupiedAvatars.includes(avatar.url)
            const displayName = lang === 'en' ? avatar.nameEn : avatar.nameDe
            return (
              <div 
                key={avatar.id}
                className={`avatar-option ${selectedAvatar === avatar.url ? 'selected' : ''} ${isOccupied ? 'occupied' : ''}`}
                onClick={() => !isOccupied && setSelectedAvatar(avatar.url)}
              >
                <img src={avatar.url} alt={displayName} />
                <span className="avatar-name">{displayName}</span>
                {isOccupied && <span className="occupied-label">{lang === 'en' ? 'Taken' : 'Besetzt'}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <button onClick={handleCreateGame} disabled={!selectedAvatar || isBusy}>{t('lobby.create')}</button>
      </div>
      <div className="card">
        <h3>Spiel-Setup</h3>
        <div className="form-row">
          <label>
            Bots (0-3)
            <input type="number" min={0} max={3} value={botCount} onChange={(e) => setBotCount(Number(e.target.value))} />
          </label>
          <label>
            Radius (2-6)
            <input type="number" min={2} max={6} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
          </label>
          <label>
            Runden (5-50)
            <input type="number" min={5} max={50} value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))} />
          </label>
        </div>
      </div>
      <div className="card">
        <label>
          {t('lobby.gameId')}
          <input
            type="text"
            value={gameIdInput}
            onChange={(e) => setGameIdInput(e.target.value)}
            placeholder="z.B. ABC123"
          />
        </label>
        <button onClick={handleJoinGame} disabled={isBusy}>
          {t('lobby.join')}
        </button>
      </div>

      <div className="card">
        <h3>{lang === 'en' ? 'Friends' : 'Freunde'}</h3>
        <div className="input-group">
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

        {friends.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div className="info-label">{lang === 'en' ? 'Your friends' : 'Deine Freunde'}</div>
            <ul className="player-lobby-list">
              {friends.map((f) => (
                <li key={f.id}>
                  {f.name} <span style={{ opacity: 0.7 }}>({f.email})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: '0.75rem' }}>
          <div className="info-label">{lang === 'en' ? 'Open games from friends' : 'Offene Spiele von Freunden'}</div>
          {friendGames.length === 0 ? (
            <div className="subtle-text">{lang === 'en' ? 'No open friend games.' : 'Keine offenen Freundes-Spiele.'}</div>
          ) : (
            <ul className="player-lobby-list">
              {friendGames.map((g) => (
                <li key={g.gameId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{g.friend.name}</div>
                    <div style={{ opacity: 0.7, fontSize: '0.9rem' }}>
                      {lang === 'en' ? 'Players' : 'Spieler'}: {g.players.length} • ID: {g.gameId}
                    </div>
                  </div>
                  <button type="button" onClick={() => navigate(`/game/${g.gameId}`)} disabled={isBusy}>
                    {lang === 'en' ? 'Join' : 'Beitreten'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => refreshFriendGames()} disabled={isBusy}>
            {lang === 'en' ? 'Refresh' : 'Aktualisieren'}
          </button>
        </div>
      </div>
    </div>
  )
}
