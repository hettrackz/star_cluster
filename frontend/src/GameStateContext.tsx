import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { DiceRoll, GameState, Resource, TileId, VertexId } from './gameTypes'
import { useAuth } from './AuthContext'

export type LastDiceEvent = {
  playerId: string
  roll: DiceRoll | null
  at: number
}

interface GameContextValue {
  socket: Socket | null
  isConnected: boolean
  state: GameState | null
  lastError: string | null
  lastDiceEvent: LastDiceEvent | null
  startGame: () => void
  setReady: (ready: boolean) => void
  addBot: () => void
  removeBot: () => void
  rollDice: () => void
  resolveWormhole: (params: { newBlackHoleTileId: TileId }) => void
  buildStation: (vertexId: string) => void
  upgradeStarbase: (vertexId: string) => void
  buildHyperlane: (edgeId: string) => void
  buildWarpLane: (params: { fromVertexId: VertexId; toVertexId: VertexId }) => void
  endTurn: () => void
  tradeBlackMarket: (params: { give: Resource; receive: Resource }) => void
  createTradeOffer: (params: { toPlayerId?: string | null; give: Partial<Record<Resource, number>>; want: Partial<Record<Resource, number>> }) => void
  cancelTradeOffer: (params: { offerId: string }) => void
  declineTradeOffer: (params: { offerId: string }) => void
  acceptTradeOffer: (params: { offerId: string }) => void
  counterTradeOffer: (params: { offerId: string; give: Partial<Record<Resource, number>>; want: Partial<Record<Resource, number>> }) => void
  sendChatMessage: (text: string) => void
}

const GameStateContext = createContext<GameContextValue | undefined>(undefined)

interface Props {
  gameId: string
  playerId: string
  playerName: string
  avatarUrl: string
  children: React.ReactNode
}

export function GameStateProvider({ gameId, playerId, playerName, avatarUrl, children }: Props) {
  const { backendUrl, token } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [state, setState] = useState<GameState | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastDiceEvent, setLastDiceEvent] = useState<LastDiceEvent | null>(null)
  const stateRef = useRef<GameState | null>(null)

  useEffect(() => {
    const s = io(backendUrl, {
      transports: ['websocket'],
    })

    s.on('connect', () => {
      setIsConnected(true)
      if (!token) return
      s.emit('join_game', { gameId, token, avatarUrl })
    })

    s.on('disconnect', () => {
      setIsConnected(false)
    })

    s.on('game_state', (payload: { state: GameState }) => {
      setState(payload.state)
      stateRef.current = payload.state
    })

    s.on('dice_rolled', (payload: { playerId: string; roll: DiceRoll | null }) => {
      setLastDiceEvent({ playerId: payload.playerId, roll: payload.roll, at: Date.now() })
    })

    s.on('error_message', (payload: { message: string }) => {
      setLastError(payload.message)
    })

    s.on('game_ended', (payload: { reason: 'inactive_turns' | 'inactive_time' | 'empty' }) => {
      const msg =
        payload.reason === 'empty'
          ? 'Spiel beendet: Alle Spieler haben das Spiel verlassen.'
          : payload.reason === 'inactive_turns'
            ? 'Spiel beendet: Zu lange keine Interaktion.'
            : 'Spiel beendet: Inaktiv.'
      setLastError(msg)
      window.location.href = '/'
    })

    setSocket(s)

    return () => {
      s.disconnect()
    }
  }, [backendUrl, gameId, playerId, playerName, avatarUrl, token])

  const value: GameContextValue = useMemo(
    () => ({
      socket,
      isConnected,
      state,
      lastError,
      lastDiceEvent,
      startGame: () => {
        if (!socket || !socket.connected) {
          setLastError('Nicht verbunden.')
          return
        }
        socket.timeout(1500).emit('start_game', { gameId }, (err: unknown, res?: { ok: boolean; message?: string }) => {
          if (err) setLastError('Keine Antwort vom Server.')
          else if (res && res.ok === false && res.message) setLastError(res.message)
        })
      },
      setReady: (ready: boolean) => {
        if (!socket || !socket.connected) {
          setLastError('Nicht verbunden.')
          return
        }
        socket.timeout(1500).emit('player_ready_set', { gameId, ready }, (err: unknown, res?: { ok: boolean; message?: string }) => {
          if (err) setLastError('Keine Antwort vom Server.')
          else if (res && res.ok === false && res.message) setLastError(res.message)
        })
      },
      addBot: () => {
        if (!socket || !socket.connected) {
          setLastError('Nicht verbunden.')
          return
        }
        socket.timeout(1500).emit('lobby_add_bot', { gameId }, (err: unknown, res?: { ok: boolean; message?: string }) => {
          if (err) setLastError('Keine Antwort vom Server.')
          else if (res && res.ok === false && res.message) setLastError(res.message)
        })
      },
      removeBot: () => {
        if (!socket || !socket.connected) {
          setLastError('Nicht verbunden.')
          return
        }
        socket.timeout(1500).emit('lobby_remove_bot', { gameId }, (err: unknown, res?: { ok: boolean; message?: string }) => {
          if (err) setLastError('Keine Antwort vom Server.')
          else if (res && res.ok === false && res.message) setLastError(res.message)
        })
      },
      rollDice: () => {
        if (!socket) return
        socket.emit('roll_dice', { gameId })
      },
      resolveWormhole: (params: { newBlackHoleTileId: TileId }) => {
        if (!socket) return
        socket.emit('resolve_wormhole', { gameId, ...params })
      },
      buildStation: (vertexId: string) => {
        if (!socket) return
        socket.emit('build_station', { gameId, vertexId })
      },
      upgradeStarbase: (vertexId: string) => {
        if (!socket) return
        socket.emit('upgrade_starbase', { gameId, vertexId })
      },
      buildHyperlane: (edgeId: string) => {
        if (!socket) return
        socket.emit('build_hyperlane', { gameId, edgeId })
      },
      buildWarpLane: (params: { fromVertexId: VertexId; toVertexId: VertexId }) => {
        if (!socket) return
        socket.emit('build_warp_lane', { gameId, ...params })
      },
      endTurn: () => {
        if (!socket) return
        socket.emit('end_turn', { gameId })
      },
      tradeBlackMarket: (params: { give: Resource; receive: Resource }) => {
        if (!socket) return
        socket.emit('black_market_trade', { gameId, ...params })
      },
      createTradeOffer: (params: { toPlayerId?: string | null; give: Partial<Record<Resource, number>>; want: Partial<Record<Resource, number>> }) => {
        if (!socket) return
        socket.emit('trade_offer_create', { gameId, ...params })
      },
      cancelTradeOffer: (params: { offerId: string }) => {
        if (!socket) return
        socket.emit('trade_offer_cancel', { gameId, ...params })
      },
      declineTradeOffer: (params: { offerId: string }) => {
        if (!socket) return
        socket.emit('trade_offer_decline', { gameId, ...params })
      },
      acceptTradeOffer: (params: { offerId: string }) => {
        if (!socket) return
        socket.emit('trade_offer_accept', { gameId, ...params })
      },
      counterTradeOffer: (params: { offerId: string; give: Partial<Record<Resource, number>>; want: Partial<Record<Resource, number>> }) => {
        if (!socket) return
        socket.emit('trade_offer_counter', { gameId, ...params })
      },
      sendChatMessage: (text: string) => {
        if (!socket) return
        socket.emit('send_chat_message', { gameId, text })
      },
    }),
    [socket, isConnected, state, lastError, lastDiceEvent, gameId],
  )

  return <GameStateContext.Provider value={value}>{children}</GameStateContext.Provider>
}

export function useGameState() {
  const ctx = useContext(GameStateContext)
  if (!ctx) {
    throw new Error('useGameState must be used inside GameStateProvider')
  }
  return ctx
}
