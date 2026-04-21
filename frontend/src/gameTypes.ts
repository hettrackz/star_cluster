export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow'

export type Resource = 'metal' | 'gas' | 'crystal' | 'food' | 'data'

export type Biome = 'nebula' | 'asteroid' | 'frozen' | 'farm' | 'ruins' | 'singularity'

export type TileId = string
export type VertexId = string
export type EdgeId = string

export interface Player {
  id: string
  name: string
  color: PlayerColor
  avatarUrl?: string | undefined
  isBot: boolean
  score: number
  resources: Record<Resource, number>
}

export interface BoardVertex {
  id: VertexId
  x: number
  y: number
}

export interface BoardEdge {
  id: EdgeId
  a: VertexId
  b: VertexId
}

export interface BoardTile {
  id: TileId
  q: number
  r: number
  biome: Biome
  numberToken: number | null
  center: { x: number; y: number }
  cornerVertexIds: VertexId[]
}

export interface BoardState {
  radius: number
  tiles: BoardTile[]
  vertices: BoardVertex[]
  edges: BoardEdge[]
}

export interface Station {
  id: string
  playerId: string
  vertexId: VertexId
  level: 'station' | 'starbase'
}

export interface Hyperlane {
  id: string
  playerId: string
  edgeId: EdgeId
}

export interface WarpLane {
  id: string
  playerId: string
  fromVertexId: VertexId
  toVertexId: VertexId
}

export interface DiceRoll {
  d1: number
  d2: number
  sum: number
}

export interface ChatMessage {
  id: string
  playerId: string
  playerName: string
  text: string
  timestamp: number
}

export interface GameEvent {
  id: string
  timestamp: number
  text: string
}

export type TurnPhase = 'await_roll' | 'main' | 'wormhole'

export type SetupRequiredPlacement = 'station' | 'hyperlane'

export interface SetupState {
  step: 1 | 2
  direction: 1 | -1
  required: SetupRequiredPlacement
  placementsByPlayerId: Record<
    string,
    {
      stationsPlaced: number
      hyperlanesPlaced: number
    }
  >
}

export interface GameState {
  id: string
  status: 'lobby' | 'setup_phase_1' | 'setup_phase_2' | 'playing' | 'finished'
  creatorId: string
  players: Player[]
  currentPlayerIndex: number
  round: number
  roundStartedAt: number
  maxRounds: number
  phase: TurnPhase
  setup: SetupState | null
  board: BoardState
  stations: Station[]
  hyperlanes: Hyperlane[]
  warpLanes: WarpLane[]
  blackHoleTileId: TileId
  lastDiceRoll: DiceRoll | null
  winnerPlayerId: string | null
  chatMessages: ChatMessage[]
  events: GameEvent[]
  turnStartedAt: number
}
