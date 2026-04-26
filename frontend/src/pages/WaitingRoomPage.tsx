import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { GameStateProvider, useGameState } from '../GameStateContext'
import type { Player } from '../gameTypes'

function renderAvatar(p: Player, className: string) {
  const animated =
    p.isBot
      ? '/avatars/avatar_bot_animated.mp4'
      : p.avatarUrl?.includes('avatar_diplomat')
        ? '/avatars/avatar_diplomat_animated.mp4'
        : p.avatarUrl?.includes('avatar_knight')
          ? '/avatars/avatar_knight_animated.mp4'
          : p.avatarUrl?.includes('avatar_technician')
            ? '/avatars/avatar_technician_animated.mp4'
            : p.avatarUrl?.includes('avatar_wise_alien')
              ? '/avatars/avatar_wise_alien_animated.mp4'
              : null

  if (animated) {
    return (
      <video
        className={className}
        src={animated}
        loop
        autoPlay
        muted
        playsInline
        disablePictureInPicture
      />
    )
  }

  const src = p.avatarUrl ? p.avatarUrl : null
  if (src) return <img src={src} alt={p.name} className={className} />
  return <div className={`${className} waiting-avatar-fallback`}>{(p.name || '—').slice(0, 1).toUpperCase()}</div>
}

function WaitingRoomInner() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isConnected, state, lastError, startGame, setReady, addBot, removeBot } = useGameState()

  useEffect(() => {
    if (!state) return
    if (state.status !== 'lobby') navigate(`/game/${state.id}`, { replace: true })
  }, [state, navigate])

  const meId = user?.id ?? ''
  const me = state?.players.find((p) => p.id === meId) ?? null
  const isCreator = Boolean(state && meId && state.creatorId === meId)
  const botCount = state ? state.players.filter((p) => p.isBot).length : 0
  const humanPlayers = state ? state.players.filter((p) => !p.isBot) : []
  const allHumansReady = state ? humanPlayers.every((p) => p.isReady) : false
  const canStart = Boolean(state && isCreator && allHumansReady && state.players.length >= 2 && state.players.length <= 4)
  const canInteract = isConnected

  const slots = useMemo(() => {
    const out: Array<{ label: string; player: Player | null }> = []
    for (let i = 0; i < 4; i++) out.push({ label: String(i), player: state?.players[i] ?? null })
    return out
  }, [state])

  if (!state) return <div className="page"><div className="loading">Lädt…</div></div>

  return (
    <div className="page waiting-room-page">
      <div className="card waiting-card">
        <div className="waiting-title-row">
          <div className="waiting-title-left">
            <div className="waiting-title">
              <span>Waiting Room</span>
              {!allHumansReady ? <span className="waiting-title-hint">Alle Spieler müssen bereit sein</span> : null}
            </div>
            <div className="waiting-subrow">
              <span className="waiting-chip">
                <span className="material-symbols-rounded" aria-hidden="true">tag</span>
                {state.id}
              </span>
              <span className={`waiting-chip ${isConnected ? 'ok' : 'warn'}`}>
                <span className="material-symbols-rounded" aria-hidden="true">{isConnected ? 'wifi' : 'wifi_off'}</span>
                {isConnected ? 'Verbunden' : 'Verbinde…'}
              </span>
            </div>
          </div>
          <button type="button" className="star-btn icon-only" aria-label="Zur Lobby" title="Zur Lobby" onClick={() => navigate('/lobby')}>
            <span className="material-symbols-rounded" aria-hidden="true">arrow_back</span>
          </button>
        </div>

        {lastError ? <div className="error-banner waiting-error">{lastError}</div> : null}

        <div className="waiting-compact-grid">
          <div className="waiting-setup-row">
            <div className="waiting-chip">
              <span className="material-symbols-rounded" aria-hidden="true">hexagon</span>
              R{state.board.radius}
            </div>
            <div className="waiting-chip">
              <span className="material-symbols-rounded" aria-hidden="true">trophy</span>
              {state.maxRounds}
            </div>
            <div className="waiting-chip">
              <span className="material-symbols-rounded" aria-hidden="true">timer</span>
              {Math.floor(state.turnLimitMs / 1000)}s
            </div>
            <div className="waiting-chip">
              <span className="material-symbols-rounded" aria-hidden="true">smart_toy</span>
              {botCount}/3
            </div>
          </div>

          <div className="waiting-slots">
            {slots.map((s, idx) => {
              const p = s.player
              const readyIcon = p?.isBot ? 'smart_toy' : p?.isReady ? 'check_circle' : 'radio_button_unchecked'
              return (
                <div key={idx} className="waiting-slot">
                  {p ? (
                    <>
                      <div className="waiting-slot-avatar">
                        {renderAvatar(p, 'waiting-avatar')}
                      </div>
                      <div className="waiting-slot-name">{p.name}{p.isBot ? ' (Bot)' : ''}</div>
                      <span className={`material-symbols-rounded waiting-ready-icon ${p.isReady ? 'ok' : ''}`} aria-hidden="true">{readyIcon}</span>
                    </>
                  ) : (
                    <div className="subtle-text">Frei</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="waiting-actions">
          {!me?.isBot && me ? (
            <button
              type="button"
              className={`star-btn ${me.isReady ? 'active' : ''}`}
              onClick={() => setReady(!me.isReady)}
              disabled={!canInteract}
            >
              <span className="material-symbols-rounded" aria-hidden="true">{me.isReady ? 'check_circle' : 'radio_button_unchecked'}</span>
              {me.isReady ? 'Bereit' : 'Bereit'}
            </button>
          ) : null}

          {!me?.isBot && me ? (
            <>
              <button
                type="button"
                className="star-btn icon-only"
                aria-label="Bot hinzufügen"
                title="Bot hinzufügen"
                onClick={() => addBot()}
                disabled={!canInteract || state.players.length >= 4 || botCount >= 3}
              >
                <span className="material-symbols-rounded" aria-hidden="true">person_add</span>
              </button>
              <button
                type="button"
                className="star-btn icon-only"
                aria-label="Bot entfernen"
                title="Bot entfernen"
                onClick={() => removeBot()}
                disabled={!canInteract || botCount <= 0}
              >
                <span className="material-symbols-rounded" aria-hidden="true">person_remove</span>
              </button>
            </>
          ) : null}

          {isCreator ? (
            <button
              type="button"
              className="star-btn"
              onClick={() => startGame()}
              disabled={!canInteract || !canStart}
            >
              <span className="material-symbols-rounded" aria-hidden="true">play_arrow</span>
              Start
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function WaitingRoomPage() {
  const { gameId } = useParams()
  const { user } = useAuth()
  if (!gameId || !user) return <div className="page"><div className="loading">Lädt…</div></div>
  return (
    <GameStateProvider gameId={gameId} playerId={user.id} playerName={user.name} avatarUrl={user.avatarUrl ?? ''}>
      <WaitingRoomInner />
    </GameStateProvider>
  )
}
