import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

const tMap = {
  de: {
    round: 'Runde', setup: 'Aufbau', time: 'Rundenzeit', build: 'Bauen', market: 'Schwarzmarkt',
    log: 'Log', chat: 'Chat', recipes: 'Rezepte', endTurn: 'Zug Ende', soundOn: 'Ton an', soundOff: 'Ton aus',
    pts: 'Punkte', res: 'Rohstoffe', winner: 'Gewinner', win: 'Sieg!', station: 'Station',
    starbase: 'Sternenbasis', hyperlane: 'Hyperlane', warp: 'Warp-Lane', blackhole: 'Schwarzes Loch',
    close: 'Schließen', cancel: 'Abbrechen', events: 'Ereignisse', dice: 'Würfel', gas: 'Gas',
    metal: 'Metall', crystal: 'Kristall', food: 'Nahrung', data: 'Daten', leaveGame: 'Spiel verlassen',
    leaveGameConfirm: 'Spiel wirklich beenden und zur Lobby zurückkehren?',
    langToggle: 'EN', dragPlace: 'Ziehen zum Platzieren', dragCancel: 'ESC: Abbrechen',
    startChoose: 'Startpunkt wählen', targetChoose: 'Zielpunkt wählen', startGame: 'Spiel starten',
    setupFree: 'Setup: kostenlos',
    turnNow: 'Am Zug',
    hyperlaneEdgeHint: 'Hyperlane: Kante klicken · ESC: Abbrechen'
  },
  en: {
    round: 'Round', setup: 'Setup', time: 'Round Time', build: 'Build', market: 'Market',
    log: 'Log', chat: 'Chat', recipes: 'Recipes', endTurn: 'End Turn', soundOn: 'Sound On', soundOff: 'Sound Off',
    pts: 'Pts', res: 'Res', winner: 'Winner', win: 'Victory!', station: 'Station',
    starbase: 'Starbase', hyperlane: 'Hyperlane', warp: 'Warp-Lane', blackhole: 'Black Hole',
    close: 'Close', cancel: 'Cancel', events: 'Events', dice: 'Dice', gas: 'Gas',
    metal: 'Metal', crystal: 'Crystal', food: 'Food', data: 'Data', leaveGame: 'Leave Game',
    leaveGameConfirm: 'Leave the game and return to the lobby?',
    langToggle: 'DE', dragPlace: 'Drag to place', dragCancel: 'ESC: Cancel',
    startChoose: 'Choose start point', targetChoose: 'Choose target point', startGame: 'Start game',
    setupFree: 'Setup: free',
    turnNow: 'Turn',
    hyperlaneEdgeHint: 'Hyperlane: click an edge · ESC: Cancel'
  }
}

import { useNavigate, useParams } from 'react-router-dom'
import { GameStateProvider, useGameState } from '../GameStateContext'
import type { BoardEdge, BoardTile, BoardVertex, GameState, Player, Resource, VertexId } from '../gameTypes'
import { Chat } from '../components/Chat'
import { useAuth } from '../AuthContext'

function sumResources(r: Record<Resource, number>) {
  return Object.values(r).reduce((a, b) => a + b, 0)
}

function resourceIconSrc(r: Resource) {
  if (r === 'crystal') return '/avatars/crystal.svg'
  if (r === 'data') return '/avatars/data.svg'
  if (r === 'food') return '/avatars/food.svg'
  if (r === 'metal') return '/avatars/metal.svg'
  return '/avatars/gas1.svg'
}

function tileResource(b: BoardTile['biome']): Resource | null {
  if (b === 'nebula') return 'gas'
  if (b === 'asteroid') return 'metal'
  if (b === 'frozen') return 'crystal'
  if (b === 'farm') return 'food'
  if (b === 'ruins') return 'data'
  return null
}

function tileBgColor(b: BoardTile['biome']) {
  if (b === 'nebula') return 'rgba(82, 31, 118, 0.86)'
  if (b === 'asteroid') return 'rgba(52, 67, 90, 0.86)'
  if (b === 'frozen') return 'rgba(18, 78, 124, 0.86)'
  if (b === 'farm') return 'rgba(22, 82, 48, 0.86)'
  if (b === 'ruins') return 'rgba(122, 72, 24, 0.86)'
  return 'rgba(10, 19, 38, 0.86)'
}

function tileGlowColor(b: BoardTile['biome']) {
  if (b === 'nebula') return 'rgba(170, 85, 247, 0.55)'
  if (b === 'asteroid') return 'rgba(148, 163, 184, 0.55)'
  if (b === 'frozen') return 'rgba(56, 189, 248, 0.55)'
  if (b === 'farm') return 'rgba(34, 197, 94, 0.55)'
  if (b === 'ruins') return 'rgba(245, 158, 11, 0.55)'
  return 'rgba(0, 245, 255, 0.45)'
}

function tokenColorByProbability(sum: number) {
  if (sum === 6 || sum === 8) return { ring: '#ef4444', text: '#7f1d1d' }
  if (sum === 5 || sum === 9) return { ring: '#fb923c', text: '#7c2d12' }
  if (sum === 4 || sum === 10) return { ring: '#f59e0b', text: '#78350f' }
  if (sum === 3 || sum === 11) return { ring: '#94a3b8', text: '#0f172a' }
  return { ring: '#64748b', text: '#0f172a' }
}

function tokenScaleByProbability(sum: number) {
  if (sum === 6 || sum === 8) return 1.22
  if (sum === 5 || sum === 9) return 1.12
  if (sum === 4 || sum === 10) return 1.04
  if (sum === 3 || sum === 11) return 0.96
  return 0.9
}

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function hashSeed(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function drawBiomeIllustration(
  ctx: CanvasRenderingContext2D,
  biome: BoardTile['biome'],
  center: { x: number; y: number },
  r: number,
  seedKey: string,
) {
  if (biome === 'singularity') return
  const rnd = makeRng(hashSeed(seedKey))

  if (biome === 'nebula') {
    for (let i = 0; i < 4; i++) {
      const x = center.x + (rnd() - 0.5) * r * 0.9
      const y = center.y + (rnd() - 0.5) * r * 0.9
      const rr = r * (0.7 + rnd() * 0.6)
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr)
      g.addColorStop(0, 'rgba(236, 72, 153, 0.20)')
      g.addColorStop(0.55, 'rgba(168, 85, 247, 0.16)')
      g.addColorStop(1, 'rgba(14, 165, 233, 0.00)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(241, 245, 249, 0.18)'
    for (let i = 0; i < 24; i++) ctx.fillRect(center.x + (rnd() - 0.5) * r * 1.7, center.y + (rnd() - 0.5) * r * 1.7, 1, 1)
  } else if (biome === 'asteroid') {
    for (let i = 0; i < 3; i++) {
      const x = center.x + (rnd() - 0.5) * r * 0.9
      const y = center.y + (rnd() - 0.5) * r * 0.9
      const rr = r * (0.32 + rnd() * 0.22)
      const g = ctx.createRadialGradient(x - rr * 0.25, y - rr * 0.25, rr * 0.1, x, y, rr)
      g.addColorStop(0, 'rgba(226, 232, 240, 0.22)')
      g.addColorStop(0.55, 'rgba(148, 163, 184, 0.16)')
      g.addColorStop(1, 'rgba(15, 23, 42, 0.20)')
      ctx.fillStyle = g
      ctx.beginPath()
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI * 2 * k) / 8 + rnd() * 0.25
        const pr = rr * (0.78 + rnd() * 0.28)
        const px = x + Math.cos(a) * pr
        const py = y + Math.sin(a) * pr
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.12)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  } else if (biome === 'frozen') {
    for (let i = 0; i < 3; i++) {
      const x = center.x + (rnd() - 0.5) * r * 0.7
      const y = center.y + (rnd() - 0.5) * r * 0.7
      const h = r * (0.65 + rnd() * 0.25)
      const w = h * (0.35 + rnd() * 0.25)
      const g = ctx.createLinearGradient(x - w, y - h, x + w, y + h)
      g.addColorStop(0, 'rgba(241, 245, 249, 0.26)')
      g.addColorStop(0.45, 'rgba(56, 189, 248, 0.14)')
      g.addColorStop(1, 'rgba(15, 23, 42, 0.16)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(x, y - h * 0.55)
      ctx.lineTo(x + w, y - h * 0.05)
      ctx.lineTo(x + w * 0.55, y + h * 0.6)
      ctx.lineTo(x - w * 0.55, y + h * 0.6)
      ctx.lineTo(x - w, y - h * 0.05)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.16)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.10)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, y - h * 0.5)
      ctx.lineTo(x, y + h * 0.6)
      ctx.stroke()
    }
  } else if (biome === 'farm') {
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.16)'
    ctx.lineWidth = 3
    const angle = rnd() * Math.PI
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    for (let i = -3; i <= 3; i++) {
      const ox = center.x + (-dy) * i * (r * 0.18)
      const oy = center.y + dx * i * (r * 0.18)
      ctx.beginPath()
      ctx.moveTo(ox - dx * r * 0.9, oy - dy * r * 0.9)
      ctx.quadraticCurveTo(center.x, center.y, ox + dx * r * 0.9, oy + dy * r * 0.9)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(241, 245, 249, 0.12)'
    for (let i = 0; i < 12; i++) {
      const x = center.x + (rnd() - 0.5) * r * 1.2
      const y = center.y + (rnd() - 0.5) * r * 1.2
      ctx.beginPath()
      ctx.arc(x, y, 1.5 + rnd() * 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (biome === 'ruins') {
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.18)'
    ctx.lineWidth = 2
    for (let i = 0; i < 10; i++) {
      const x1 = center.x + (rnd() - 0.5) * r * 1.2
      const y1 = center.y + (rnd() - 0.5) * r * 1.2
      const x2 = x1 + (rnd() - 0.5) * r * 0.9
      const y2 = y1 + (rnd() - 0.5) * r * 0.9
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(241, 245, 249, 0.18)'
      ctx.beginPath()
      ctx.arc(x1, y1, 2.0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.14)'
    ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      const x1 = center.x + (rnd() - 0.5) * r * 1.0
      const y1 = center.y + (rnd() - 0.5) * r * 1.0
      const x2 = x1 + (rnd() - 0.5) * r * 0.7
      const y2 = y1 + (rnd() - 0.5) * r * 0.7
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  const g = ctx.createRadialGradient(center.x, center.y, r * 0.2, center.x, center.y, r * 1.15)
  g.addColorStop(0, 'rgba(241, 245, 249, 0.10)')
  g.addColorStop(1, 'rgba(2, 6, 23, 0.10)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(center.x, center.y, r * 1.2, 0, Math.PI * 2)
  ctx.fill()
}

function playerColor(c: Player['color']) {
  if (c === 'red') return '#ef4444'
  if (c === 'blue') return '#3b82f6'
  if (c === 'green') return '#22c55e'
  return '#eab308'
}

function useImageAssets() {
  const [version, setVersion] = useState(0)
  const assetsRef = useRef<Record<string, HTMLImageElement>>({})

  useEffect(() => {
    const entries: Record<string, string> = {
      res_gas: '/avatars/gas.png',
      res_metal: '/avatars/metal.png',
      res_food: '/avatars/food.png',
      res_data: '/avatars/data.png',
      res_crystal: '/avatars/cristals.png',
      tile_nebula: '/avatars/gas1.svg',
      tile_asteroid: '/avatars/metal.svg',
      tile_frozen: '/avatars/crystal.svg',
      tile_farm: '/avatars/food.svg',
      tile_ruins: '/avatars/data.svg',
      tile_singularity: '/avatars/black_hole.svg',
      blackhole: '/avatars/black_whole.png',
      station_red: '/avatars/station_red.png',
      station_blue: '/avatars/station_blue.png',
      station_green: '/avatars/station_green.png',
      station_yellow: '/avatars/station_yellow.png',
      starbase_red: '/avatars/starbase_red.png',
      starbase_blue: '/avatars/starbase_blue.png',
      starbase_green: '/avatars/starbase_green.png',
      starbase_yellow: '/avatars/starbase_yellow.png',
    }

    let alive = true
    const keys = Object.keys(entries)
    let loaded = 0
    for (const k of keys) {
      const img = new Image()
      img.onload = () => {
        loaded += 1
        if (alive && loaded === keys.length) setVersion((v) => v + 1)
      }
      img.onerror = () => {
        loaded += 1
        if (alive && loaded === keys.length) setVersion((v) => v + 1)
      }
      img.src = entries[k]!
      assetsRef.current[k] = img
    }

    return () => {
      alive = false
    }
  }, [])

  return { assetsRef, version }
}

function computeBounds(vertices: BoardVertex[]) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const v of vertices) {
    minX = Math.min(minX, v.x)
    maxX = Math.max(maxX, v.x)
    minY = Math.min(minY, v.y)
    maxY = Math.max(maxY, v.y)
  }
  return { minX, maxX, minY, maxY }
}

function hitTestVertex(vertices: BoardVertex[], x: number, y: number, radiusPx: number) {
  let best: { id: VertexId; d2: number } | null = null
  for (const v of vertices) {
    const dx = v.x - x
    const dy = v.y - y
    const d2 = dx * dx + dy * dy
    if (d2 <= radiusPx * radiusPx && (!best || d2 < best.d2)) best = { id: v.id, d2 }
  }
  return best?.id ?? null
}

function dist2PointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLen2 = abx * abx + aby * aby
  const t = abLen2 <= 0 ? 0 : Math.min(1, Math.max(0, (apx * abx + apy * aby) / abLen2))
  const cx = ax + abx * t
  const cy = ay + aby * t
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy
}

function hitTestEdge(edges: BoardEdge[], vById: Map<string, BoardVertex>, x: number, y: number, radiusPx: number) {
  let best: { id: string; d2: number } | null = null
  const r2 = radiusPx * radiusPx
  for (const e of edges) {
    const a = vById.get(e.a)
    const b = vById.get(e.b)
    if (!a || !b) continue
    const d2 = dist2PointToSegment(x, y, a.x, a.y, b.x, b.y)
    if (d2 <= r2 && (!best || d2 < best.d2)) best = { id: e.id, d2 }
  }
  return best?.id ?? null
}

function pointInPoly(px: number, py: number, poly: Array<{ x: number; y: number }>) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x
    const yi = poly[i]!.y
    const xj = poly[j]!.x
    const yj = poly[j]!.y
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function findTileAtPoint(state: GameState, x: number, y: number, vById: Map<string, BoardVertex>) {
  for (const t of state.board.tiles) {
    const verts = t.cornerVertexIds.map((vid) => vById.get(vid)).filter((v): v is BoardVertex => Boolean(v))
    if (verts.length !== t.cornerVertexIds.length) continue
    const poly = verts.map((v) => ({ x: v.x, y: v.y }))
    if (pointInPoly(x, y, poly)) return t
  }
  return null
}

function DiceCube({ value, rolling }: { value: number | null; rolling: boolean }) {
  if (!value) return <div className="dice-cube empty">?</div>
  const dots = Array.from({ length: value }, (_, i) => <span key={i} className="dice-dot" />)
  return (
    <div className={`dice-cube ${rolling ? 'rolling' : ''}`}>
      <div className={`dot-container d${value}`}>{dots}</div>
    </div>
  )
}

function canAfford(resources: Record<Resource, number> | undefined, cost: Partial<Record<Resource, number>>) {
  if (!resources) return false
  for (const [k, v] of Object.entries(cost) as Array<[Resource, number]>) {
    if ((resources[k] ?? 0) < (v ?? 0)) return false
  }
  return true
}

function CostInline({ cost, resources }: { cost: Partial<Record<Resource, number>>; resources: Record<Resource, number> | undefined }) {
  const order: Resource[] = ['metal', 'gas', 'crystal', 'food', 'data']
  return (
    <span className="star-cost-inline" aria-label="Kosten">
      {order
        .filter((r) => (cost[r] ?? 0) > 0)
        .map((r) => {
          const need = cost[r] ?? 0
          const have = resources?.[r] ?? 0
          const covered = Math.min(need, have)
          const missing = Math.max(0, need - have)
          return (
          <span key={r} className="star-cost-item">
            <img className="star-mini-hex" src={resourceIconSrc(r)} alt={r} />
            <span className="star-cost-num">
              <span className="star-cost-covered">{covered}</span>
              {missing > 0 ? <span className="star-cost-missing">+{missing}</span> : null}
            </span>
          </span>
          )
        })}
    </span>
  )
}

function CostStaticInline({ cost }: { cost: Partial<Record<Resource, number>> }) {
  const order: Resource[] = ['metal', 'gas', 'crystal', 'food', 'data']
  return (
    <span className="star-cost-inline" aria-label="Kosten">
      {order
        .filter((r) => (cost[r] ?? 0) > 0)
        .map((r) => {
          const need = cost[r] ?? 0
          return (
            <span key={r} className="star-cost-item">
              <img className="star-mini-hex" src={resourceIconSrc(r)} alt={r} />
              <span className="star-cost-num">
                <span className="star-cost-covered">{need}</span>
              </span>
            </span>
          )
        })}
    </span>
  )
}

function buildIcon(kind: 'station' | 'hyperlane' | 'upgrade' | 'warp' | 'blackhole', playerClr: Player['color'] | undefined) {
  const c = playerClr ?? 'blue'
  const wrap = (node: ReactNode) => <div className="star-hex-symbol">{node}</div>
  if (kind === 'station') return wrap(<img className="star-hex-img" src={`/avatars/station_${c}.png`} alt="Station" draggable={false} />)
  if (kind === 'upgrade') return wrap(<img className="star-hex-img" src={`/avatars/starbase_${c}.png`} alt="Starbase" draggable={false} />)
  if (kind === 'blackhole') {
    return wrap(
      <video
        className="star-blackhole-icon-video"
        src="/avatars/black_hole.webm"
        loop
        autoPlay
        muted
        playsInline
        disablePictureInPicture
      />
    )
  }
  if (kind === 'hyperlane') {
    return wrap(
      <span className="material-symbols-rounded" aria-hidden="true">route</span>
    )
  }
  return wrap(
    <span className="material-symbols-rounded" aria-hidden="true">swap_horiz</span>
  )
}

function GameInner() {
  const { isConnected, state, lastError } = useGameState()
  const navigate = useNavigate()

  useEffect(() => {
    if (state) return
    if (!lastError) return
    navigate('/lobby', { replace: true, state: { error: lastError } })
  }, [state, lastError, navigate])

  if (!state) {
    return (
      <div className="page">
        {lastError ? <div className="error-banner">{lastError}</div> : null}
        <div className="loading">{isConnected ? 'Lädt…' : 'Verbinde…'}</div>
      </div>
    )
  }
  return <GameInnerReady state={state} />
}

function GameInnerReady({ state }: { state: GameState }) {
  const [lang, setLang] = useState<'de'|'en'>(() => (window.localStorage.getItem('star_lang') as 'de'|'en') || 'de')
  const t = tMap[lang]
  const { socket, isConnected, lastError, lastDiceEvent, rollDice, buildStation, buildHyperlane, buildWarpLane, upgradeStarbase, endTurn, resolveWormhole, tradeBlackMarket, createTradeOffer, declineTradeOffer, acceptTradeOffer } = useGameState()
  const { user } = useAuth()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bottombarRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<'none' | 'station' | 'hyperlane' | 'upgrade' | 'warp' | 'blackhole'>('none')
  const [pendingVertex, setPendingVertex] = useState<string | null>(null)
  const [pendingWarpFrom, setPendingWarpFrom] = useState<string | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [marketGive, setMarketGive] = useState<Resource>('metal')
  const [marketReceive, setMarketReceive] = useState<Resource>('gas')
  const [marketTab, setMarketTab] = useState<'hole' | 'players'>('players')
  const [offerGive, setOfferGive] = useState<Partial<Record<Resource, number>>>({})
  const [offerWant, setOfferWant] = useState<Partial<Record<Resource, number>>>({})
  const [bottombarH, setBottombarH] = useState(84)
  const topUiInset = 44
  const [zoomLevel, setZoomLevel] = useState<0 | 1 | 2>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [visualStyle, setVisualStyle] = useState<'classic' | 'holo'>(() =>
    window.localStorage.getItem('star_visual_style') === 'holo' ? 'holo' : 'classic',
  )
  const [openMenu, setOpenMenu] = useState<'build' | 'market' | 'chat' | 'log' | 'recipes' | null>(null)
  const openMenuRef = useRef<'build' | 'market' | 'chat' | 'log' | 'recipes' | null>(null)
  const prevMenuForResetRef = useRef<'build' | 'market' | 'chat' | 'log' | 'recipes' | null>(null)
  const prevMarketTabForResetRef = useRef<'hole' | 'players'>('players')
  const resetHoleSelectionRef = useRef(false)
  const [nowMs, setNowMs] = useState(0)
  type DragState = { kind: 'station' | 'hyperlane' | 'upgrade' | 'warp' | 'blackhole'; step: 1 | 2; startVertexId?: string; x: number; y: number }
  const [drag, setDrag] = useState<null | DragState>(null)
  const [resourceFx, setResourceFx] = useState<Array<{ id: string; resource: Resource; fromX: number; fromY: number; toX: number; toY: number }>>([])
  const panRef = useRef(pan)
  const dragRef = useRef<DragState | null>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 })
  const movedRef = useRef(false)
  const skipClickRef = useRef(false)
  const transformRef = useRef<{ canvasRect: DOMRect; centerX: number; centerY: number; scale: number; panX: number; panY: number; width: number; height: number } | null>(null)
  const prevStateRef = useRef<GameState | null>(null)
  const bhVidRef = useRef<HTMLVideoElement | null>(null)
  const finishVidRef = useRef<HTMLVideoElement | null>(null)
  const [finishDone, setFinishDone] = useState(false)
  const stateRefLocal = useRef<GameState | null>(null)
  const meIdRef = useRef('')
  const handleDropRef = useRef<(d: Pick<DragState, 'kind' | 'step' | 'startVertexId'>, x: number, y: number) => void>(() => {})
  const dragListenersRef = useRef<null | { move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; key: (e: KeyboardEvent) => void }>(null)
  const cornerRefByPlayerId = useRef<Record<string, HTMLDivElement | null>>({})
  const [ringRotateUntilMs, setRingRotateUntilMs] = useState(0)
  const [rotateAnim, setRotateAnim] = useState<null | { startMs: number; durationMs: number; entries: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; biome: BoardTile['biome']; numberToken: number | null }> }>(null)
  const [productionHighlightSum, setProductionHighlightSum] = useState<number | null>(null)
  const productionAnimTimeoutsRef = useRef<number[]>([])
  const prevForRotateRef = useRef<GameState | null>(null)
  const [isMuted, setIsMuted] = useState(() => window.localStorage.getItem('star_cluster_muted') === '1')
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastEventIdRef = useRef<string | null>(null)
  const playToneRef = useRef<(freq: number, durationMs: number, type: OscillatorType, gainValue: number) => void>(() => {})
  const stopDragRef = useRef<() => void>(() => {})
  const [hoverVertexId, setHoverVertexId] = useState<string | null>(null)
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null)
  const [eventToast, setEventToast] = useState<{ text: string; untilMs: number } | null>(null)
  const [dealNotice, setDealNotice] = useState<null | { text: string; kind: 'ok' | 'bad' | 'info' }>(null)
  const [dragShake, setDragShake] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [hoverTileTip, setHoverTileTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const eventTextRef = useRef<HTMLDivElement | null>(null)
  const [eventMarquee, setEventMarquee] = useState(false)
  const rightDockRef = useRef<HTMLDivElement | null>(null)
  const [eventRightInset, setEventRightInset] = useState(220)
  const [actionDockTopPx, setActionDockTopPx] = useState<number | null>(null)
  const actionDockGroupRef = useRef<HTMLDivElement | null>(null)
  const [actionDockTwoCol, setActionDockTwoCol] = useState(false)
  const [cursorBuildPos, setCursorBuildPos] = useState<{ x: number; y: number } | null>(null)
  const [rotateFlash, setRotateFlash] = useState<{
    startMs: number
    durationMs: number
    entries: Array<{ destTileId: string; biome: BoardTile['biome']; numberToken: number | null }>
  } | null>(null)
  const [bhBoostUntilMs, setBhBoostUntilMs] = useState(0)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const wormholePromptedRef = useRef(false)
  const lastSeenIncomingOfferIdRef = useRef<string | null>(null)
  const holoNoisePatternRef = useRef<CanvasPattern | null>(null)
  const holoFxRef = useRef<
    Array<
      | { kind: 'pulse_vertex'; vertexId: string; startMs: number; color: string }
      | { kind: 'pulse_edge'; edgeId: string; startMs: number; color: string }
    >
  >([])
  const pendingBlackHoleTradeRef = useRef<null | {
    token: string
    give: Resource
    receive: Resource
    rate: number
    startedAtMs: number
    before: {
      giveHave: number
      receiveHave: number
      poolGive: number
      poolReceive: number
    }
  }>(null)
  const pendingTradeOfferCreateRef = useRef<null | { token: string; startedAtMs: number }>(null)
  const lastTradeOfferStatusRef = useRef<null | { offerId: string; status: string }>(null)
  const pendingTradeAcceptRef = useRef<string | null>(null)

  const meId = user?.id ?? ''
  const { assetsRef, version: assetsVersion } = useImageAssets()

  const vById = useMemo(() => new Map((state?.board.vertices ?? []).map((v) => [v.id, v] as const)), [state?.board.vertices])
  const eByKey = useMemo(() => {
    const m = new Map<string, BoardEdge>()
    for (const e of state?.board.edges ?? []) {
      const k = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`
      m.set(k, e)
    }
    return m
  }, [state?.board.edges])

  const neighborsByVertex = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const e of state?.board.edges ?? []) {
      const a = m.get(e.a) ?? []
      a.push(e.b)
      m.set(e.a, a)
      const b = m.get(e.b) ?? []
      b.push(e.a)
      m.set(e.b, b)
    }
    return m
  }, [state?.board.edges])

  const isMyTurn = Boolean(state && state.players[state.currentPlayerIndex]?.id === meId)

  const setVisualStyleBoth = (next: 'classic' | 'holo') => {
    setVisualStyle(next)
    window.localStorage.setItem('star_visual_style', next)
  }

  const emitHoloPulseVertex = (vertexId: string) => {
    if (visualStyle !== 'holo') return
    const clr = playerColor(state.players.find((p) => p.id === meId)?.color ?? 'blue')
    holoFxRef.current.push({ kind: 'pulse_vertex', vertexId, startMs: Date.now(), color: clr })
  }
  const emitHoloPulseEdge = (edgeId: string) => {
    if (visualStyle !== 'holo') return
    const clr = playerColor(state.players.find((p) => p.id === meId)?.color ?? 'blue')
    holoFxRef.current.push({ kind: 'pulse_edge', edgeId, startMs: Date.now(), color: clr })
  }

  useEffect(() => {
    if (!state) return
    if (state.status === 'lobby') navigate(`/waiting/${state.id}`, { replace: true })
  }, [state, navigate])

  const axialDistance = (q: number, r: number) => {
    const x = q
    const z = r
    const y = -x - z
    return (Math.abs(x) + Math.abs(y) + Math.abs(z)) / 2
  }

  useEffect(() => {
    if (lastError) console.error(lastError)
  }, [lastError])

  useEffect(() => {
    if (!lastDiceEvent) return
    setIsRolling(true)
    const t = window.setTimeout(() => setIsRolling(false), 650)
    playToneRef.current(220, 90, 'square', 0.06)
    window.setTimeout(() => playToneRef.current(330, 140, 'square', 0.06), 90)
    return () => window.clearTimeout(t)
  }, [lastDiceEvent])

  useEffect(() => {
    if (state?.status !== 'finished') {
      setFinishDone(false)
      return
    }
    const v = finishVidRef.current
    if (!v) return
    wormholePromptedRef.current = false
    v.currentTime = 0
    void v.play()
  }, [state?.status])

  useEffect(() => {
    if (state?.phase !== 'wormhole') {
      wormholePromptedRef.current = false
      if (mode === 'blackhole') setMode('none')
      return
    }
    if (!isMyTurn) return
    if (wormholePromptedRef.current) return
    wormholePromptedRef.current = true
    setEventToast({ text: 'Schwarzes Loch: Icon anklicken, dann Ziel wählen', untilMs: nowMs + 2800 })
  }, [state?.phase, isMyTurn, mode, nowMs])

  useEffect(() => {
    if (!state || state.events.length === 0) return
    const last = state.events[state.events.length - 1]
    if (last?.text?.includes('Äußerer Ring rotiert')) {
      setRingRotateUntilMs(nowMs + 1700)
    }
  }, [state])

  useEffect(() => {
    if (!state) return
    const prev = prevForRotateRef.current
    prevForRotateRef.current = state
    const last = state.events[state.events.length - 1]
    if (!prev || !last?.text?.includes('Äußerer Ring rotiert')) return

    const isOuter = (t: BoardTile) => axialDistance(t.q, t.r) === state.board.radius
    const prevOuter = prev.board.tiles.filter(isOuter)
    const nextOuter = state.board.tiles.filter(isOuter)
    if (prevOuter.length === 0 || nextOuter.length === 0 || prevOuter.length !== nextOuter.length) return

    const centerPrev = prev.board.tiles.find((t) => t.biome === 'singularity')?.center ?? { x: 0, y: 0 }
    const orderByAngle = (a: BoardTile, b: BoardTile) => {
      const aa = Math.atan2(a.center.y - centerPrev.y, a.center.x - centerPrev.x)
      const bb = Math.atan2(b.center.y - centerPrev.y, b.center.x - centerPrev.x)
      return aa - bb
    }

    const prevRing = prevOuter.slice().sort(orderByAngle)
    const nextRing = nextOuter.slice().sort(orderByAngle)

    const prevSig = prevRing.map((t) => `${t.biome}|${t.numberToken ?? ''}`)
    const nextSig = nextRing.map((t) => `${t.biome}|${t.numberToken ?? ''}`)
    let bestShift = 0
    let bestScore = -1
    const n = prevSig.length
    for (let s = 0; s < n; s++) {
      let score = 0
      for (let i = 0; i < n; i++) {
        if (prevSig[i] === nextSig[(i + s) % n]) score++
      }
      if (score > bestScore) {
        bestScore = score
        bestShift = s
      }
    }

    const entries = prevRing.map((t, i) => {
      const dest = nextRing[(i + bestShift) % n]!
      return { from: t.center, to: dest.center, destTileId: dest.id, biome: t.biome, numberToken: t.numberToken }
    })

    setRotateAnim({ startMs: nowMs, durationMs: 1800, entries })
    setRotateFlash({
      startMs: nowMs + 1800,
      durationMs: 3000,
      entries: entries.map((e) => ({ destTileId: e.destTileId, biome: e.biome, numberToken: e.numberToken ?? null })),
    })
  }, [state])

  useEffect(() => {
    if (!state) return
    const prev = prevStateRef.current
    prevStateRef.current = state
    if (prev && prev.blackHoleTileId !== state.blackHoleTileId) {
      setBhBoostUntilMs(nowMs + 4200)
    }
  }, [state?.blackHoleTileId])

  useEffect(() => {
    if (mode === 'none') return
    const onDown = (e: PointerEvent) => {
      const wrap = canvasWrapRef.current
      if (!wrap) return
      if (wrap.contains(e.target as Node)) return
      setMode('none')
      setPendingVertex(null)
      setPendingWarpFrom(null)
      setHoverEdgeId(null)
    }
    const onCtx = (e: MouseEvent) => {
      e.preventDefault()
      setMode('none')
      setPendingVertex(null)
      setPendingWarpFrom(null)
      setHoverEdgeId(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('contextmenu', onCtx, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('contextmenu', onCtx, true)
    }
  }, [mode])

  useEffect(() => {
    if (!state) return
    const m = openMenuRef.current
    if (m === 'build' || m === 'market') setOpenMenu(null)
    setMode('none')
    setPendingVertex(null)
    setPendingWarpFrom(null)
    setHoverEdgeId(null)
    stopDragRef.current()
  }, [state?.turnStartedAt, state?.currentPlayerIndex])

  useEffect(() => {
    openMenuRef.current = openMenu
  }, [openMenu])

  useEffect(() => {
    const prevMenu = prevMenuForResetRef.current
    const prevTab = prevMarketTabForResetRef.current
    prevMenuForResetRef.current = openMenu
    prevMarketTabForResetRef.current = marketTab

    if (openMenu === 'market' && prevMenu !== 'market') {
      setDealNotice(null)
      if (marketTab === 'hole') resetHoleSelectionRef.current = true
    }
    if (openMenu === 'market' && marketTab === 'hole' && prevTab !== 'hole') {
      resetHoleSelectionRef.current = true
    }
  }, [openMenu, marketTab])

  useEffect(() => {
    if (!state) return
    if (state.status !== 'playing') return
    if (!meId) return
    const latest = state.tradeOffers
      .filter((o) => o.status === 'open')
      .filter((o) => o.fromPlayerId !== meId)
      .filter((o) => o.toPlayerId === null || o.toPlayerId === meId)
      .slice(-1)[0]
    if (!latest) return
    if (lastSeenIncomingOfferIdRef.current === latest.id) return
    lastSeenIncomingOfferIdRef.current = latest.id
    const me = state.players.find((p) => p.id === meId) ?? null
    const canPayWant = (Object.entries(latest.want) as Array<[Resource, number]>).every(([r, n]) => {
      return (me?.resources[r] ?? 0) >= (n ?? 0)
    })
    if (!canPayWant) {
      if (latest.toPlayerId === meId) {
        declineTradeOffer({ offerId: latest.id })
      }
      return
    }
    setMarketTab('players')
    setOpenMenu('market')
  }, [state?.status, state?.tradeOffers?.length, state?.tradeOffers?.[state.tradeOffers.length - 1]?.id, meId])

  function playTone(freq: number, durationMs: number, type: OscillatorType, gainValue: number) {
    if (isMuted) return
    try {
      const Ctx = window.AudioContext
      if (!Ctx) return
      const ctx = audioCtxRef.current ?? new Ctx()
      audioCtxRef.current = ctx

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      gain.gain.value = gainValue
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + durationMs / 1000)
    } catch {
      void 0
    }
  }

  useEffect(() => {
    playToneRef.current = playTone
  })

  useEffect(() => {
    window.localStorage.setItem('star_cluster_muted', isMuted ? '1' : '0')
  }, [isMuted])

  useEffect(() => {
    const update = () => {
      if (bottombarRef.current) setBottombarH(bottombarRef.current.getBoundingClientRect().height)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  useEffect(() => {
    stateRefLocal.current = state
  }, [state])

  useEffect(() => {
    if (openMenu !== 'market') return
    if (!state) return
    if (marketTab !== 'hole') return
    const ro: Resource[] = ['metal', 'gas', 'crystal', 'food', 'data']

    const pool = state.blackHolePool
    const availableReceive = ro.filter((r) => (pool?.[r] ?? 0) > 0)
    const meLocal = state.players.find((p) => p.id === meId) ?? null
    const availableGive = ro.filter((r) => (meLocal?.resources?.[r] ?? 0) > 0)
    if (resetHoleSelectionRef.current) {
      resetHoleSelectionRef.current = false
      if (availableReceive.length) setMarketReceive(availableReceive[0]!)
      if (availableGive.length) setMarketGive(availableGive[0]!)
      return
    }

    if (availableReceive.length && (pool?.[marketReceive] ?? 0) <= 0) {
      setMarketReceive(availableReceive[0]!)
    }
    if (availableGive.length && (meLocal?.resources?.[marketGive] ?? 0) <= 0) {
      setMarketGive(availableGive[0]!)
    }
  }, [openMenu, state, meId, marketTab, marketReceive, marketGive])

  useEffect(() => {
    meIdRef.current = meId
  }, [meId])

  const setDragBoth = (d: DragState | null) => {
    dragRef.current = d
    setDrag(d)
  }

  function stopDrag() {
    const ls = dragListenersRef.current
    if (ls) {
      window.removeEventListener('pointermove', ls.move)
      window.removeEventListener('pointerup', ls.up)
      window.removeEventListener('keydown', ls.key)
      dragListenersRef.current = null
    }
    setDragBoth(null)
  }

  useEffect(() => {
    stopDragRef.current = stopDrag
  })

  function clientToBoard(clientX: number, clientY: number) {
    const t = transformRef.current
    if (!t) return null
    const x = clientX - t.canvasRect.left
    const y = clientY - t.canvasRect.top
    const bx = (x - t.width / 2 - t.panX) / t.scale + t.centerX
    const by = (y - t.height / 2 - t.panY) / t.scale + t.centerY
    return { bx, by }
  }

  function isBoundaryVertex(state: GameState, vertexId: string) {
    for (const t of state.board.tiles) {
      if (axialDistance(t.q, t.r) === state.board.radius && t.cornerVertexIds.includes(vertexId)) return true
    }
    return false
  }

  function isVertexOccupiedByStation(state: GameState, vertexId: string) {
    return state.stations.some((s) => s.vertexId === vertexId)
  }

  function violatesStationDistance(state: GameState, vertexId: string) {
    if (isVertexOccupiedByStation(state, vertexId)) return true
    for (const s of state.stations) {
      const neigh = neighborsByVertex.get(s.vertexId) ?? []
      if (neigh.includes(vertexId)) return true
    }
    return false
  }

  function hasAnyBuild(state: GameState, playerId: string) {
    return state.stations.some((s) => s.playerId === playerId) || state.hyperlanes.some((h) => h.playerId === playerId) || state.warpLanes.some((w) => w.playerId === playerId)
  }

  function isConnectedVertex(state: GameState, playerId: string, vertexId: string) {
    if (state.stations.some((s) => s.playerId === playerId && s.vertexId === vertexId)) return true
    for (const h of state.hyperlanes) {
      if (h.playerId !== playerId) continue
      const e = state.board.edges.find((x) => x.id === h.edgeId)
      if (!e) continue
      if (e.a === vertexId || e.b === vertexId) return true
    }
    return false
  }

  function canPlaceStationAt(state: GameState, playerId: string, vertexId: string) {
    if (state.phase !== 'main') return false
    const isSetup = state.status === 'setup_phase_1' || state.status === 'setup_phase_2'
    if (isSetup) {
      if (!state.setup || state.setup.required !== 'station') return false
      if (state.players[state.currentPlayerIndex]?.id !== playerId) return false
      const counts = state.setup.placementsByPlayerId[playerId]
      const limit = state.status === 'setup_phase_1' ? 1 : 2
      if (!counts || counts.stationsPlaced >= limit) return false
      if (violatesStationDistance(state, vertexId)) return false
      const allowDisconnected = state.status === 'setup_phase_2' && counts.stationsPlaced === 1
      if (hasAnyBuild(state, playerId) && !allowDisconnected && !isConnectedVertex(state, playerId, vertexId)) return false
      return true
    }
    if (state.status !== 'playing') return false
    if (!canAfford(state.players.find((p) => p.id === playerId)?.resources, { metal: 1, gas: 1, food: 1, crystal: 1 })) return false
    if (violatesStationDistance(state, vertexId)) return false
    if (hasAnyBuild(state, playerId) && !isConnectedVertex(state, playerId, vertexId)) return false
    return true
  }

  function canUpgradeAt(state: GameState, playerId: string, vertexId: string) {
    if (state.status !== 'playing') return false
    if (state.phase !== 'main') return false
    const me = state.players.find((p) => p.id === playerId)
    if (!me) return false
    if (!canAfford(me.resources, { data: 3, crystal: 2 })) return false
    return state.stations.some((s) => s.playerId === playerId && s.vertexId === vertexId && s.level === 'station')
  }

  function canStartHyperlaneAt(state: GameState, playerId: string, vertexId: string) {
    if (state.phase !== 'main') return false
    const isSetup = state.status === 'setup_phase_1' || state.status === 'setup_phase_2'
    if (isSetup) {
      if (!state.setup || state.setup.required !== 'hyperlane') return false
      if (state.players[state.currentPlayerIndex]?.id !== playerId) return false
      const counts = state.setup.placementsByPlayerId[playerId]
      const limit = state.status === 'setup_phase_1' ? 1 : 2
      if (!counts || counts.hyperlanesPlaced >= limit) return false
      if (!isConnectedVertex(state, playerId, vertexId)) return false
    } else {
      if (state.status !== 'playing') return false
      const me = state.players.find((p) => p.id === playerId)
      if (!me) return false
      if (!canAfford(me.resources, { metal: 1, gas: 1 })) return false
    }
    const neigh = neighborsByVertex.get(vertexId) ?? []
    for (const n of neigh) {
      const k = vertexId < n ? `${vertexId}|${n}` : `${n}|${vertexId}`
      const edge = eByKey.get(k)
      if (!edge) continue
      if (state.hyperlanes.some((h) => h.edgeId === edge.id)) continue
      return true
    }
    return false
  }

  function canFinishHyperlane(state: GameState, playerId: string, from: string, to: string) {
    if (state.phase !== 'main') return null
    const isSetup = state.status === 'setup_phase_1' || state.status === 'setup_phase_2'
    if (isSetup) {
      if (!state.setup || state.setup.required !== 'hyperlane') return null
    } else {
      if (state.status !== 'playing') return null
    }
    const k = from < to ? `${from}|${to}` : `${to}|${from}`
    const edge = eByKey.get(k)
    if (!edge) return null
    if (state.hyperlanes.some((h) => h.edgeId === edge.id)) return null
    if (!isConnectedVertex(state, playerId, from)) return null
    return edge.id
  }

  function canBuildHyperlaneEdge(state: GameState, playerId: string, edge: BoardEdge) {
    if (state.phase !== 'main') return false
    const isSetup = state.status === 'setup_phase_1' || state.status === 'setup_phase_2'
    if (isSetup) {
      if (!state.setup || state.setup.required !== 'hyperlane') return false
      if (state.players[state.currentPlayerIndex]?.id !== playerId) return false
      const counts = state.setup.placementsByPlayerId[playerId]
      const limit = state.status === 'setup_phase_1' ? 1 : 2
      if (!counts || counts.hyperlanesPlaced >= limit) return false
    } else {
      if (state.status !== 'playing') return false
      const me = state.players.find((p) => p.id === playerId)
      if (!me) return false
      if (!canAfford(me.resources, { metal: 1, gas: 1 })) return false
    }
    if (state.hyperlanes.some((h) => h.edgeId === edge.id)) return false
    if (!isConnectedVertex(state, playerId, edge.a) && !isConnectedVertex(state, playerId, edge.b)) return false
    return true
  }

  function canStartWarpAt(state: GameState, playerId: string, vertexId: string) {
    if (state.status !== 'playing') return false
    if (state.phase !== 'main') return false
    const me = state.players.find((p) => p.id === playerId)
    if (!me) return false
    if (!canAfford(me.resources, { metal: 2, gas: 2, crystal: 2, food: 2, data: 2 })) return false
    if (!isBoundaryVertex(state, vertexId)) return false
    return state.stations.some((s) => s.playerId === playerId && s.vertexId === vertexId)
  }

  function canFinishWarp(state: GameState, from: string, to: string) {
    if (from === to) return false
    if (!isBoundaryVertex(state, to)) return false
    return true
  }

  useEffect(() => {
    handleDropRef.current = (d, clientX, clientY) => {
      const st = stateRefLocal.current
      const pid = meIdRef.current
      if (!st) return setDragBoth(null)
      const p = clientToBoard(clientX, clientY)
      if (!p) {
        setDragShake(true)
        window.setTimeout(() => setDragShake(false), 240)
        window.setTimeout(() => stopDragRef.current(), 240)
        return
      }
      if (d.kind === 'blackhole') {
        if (st.phase !== 'wormhole' || st.players[st.currentPlayerIndex]?.id !== pid) return setDragBoth(null)
        const t = findTileAtPoint(st, p.bx, p.by, vById)
        if (t && t.biome !== 'singularity') resolveWormhole({ newBlackHoleTileId: t.id })
        playToneRef.current(220, 90, 'square', 0.05)
        return setDragBoth(null)
      }

      const hit = hitTestVertex(st.board.vertices, p.bx, p.by, 18 / (transformRef.current?.scale ?? 1))
      if (!hit) {
        if (d.kind === 'hyperlane' && d.step === 2) return setDragBoth(null)
        setDragShake(true)
        window.setTimeout(() => setDragShake(false), 240)
        window.setTimeout(() => stopDragRef.current(), 240)
        return
      }

      if (d.kind === 'station') {
        if (canPlaceStationAt(st, pid, hit)) {
          buildStation(hit)
          emitHoloPulseVertex(hit)
          playToneRef.current(196, 70, 'sawtooth', 0.05)
          return setDragBoth(null)
        }
        setDragShake(true)
        window.setTimeout(() => setDragShake(false), 240)
        window.setTimeout(() => stopDragRef.current(), 240)
        return
      }

      if (d.kind === 'upgrade') {
        if (canUpgradeAt(st, pid, hit)) {
          upgradeStarbase(hit)
          emitHoloPulseVertex(hit)
          playToneRef.current(196, 70, 'sawtooth', 0.05)
          return setDragBoth(null)
        }
        setDragShake(true)
        window.setTimeout(() => setDragShake(false), 240)
        window.setTimeout(() => stopDragRef.current(), 240)
        return
      }

      if (d.kind === 'hyperlane') {
        if (d.step === 1) {
          if (canStartHyperlaneAt(st, pid, hit)) {
            setEventToast({ text: 'Hyperlane: Zielpunkt wählen · ESC: Abbrechen', untilMs: nowMs + 1600 })
            return setDragBoth({ kind: 'hyperlane', step: 2, startVertexId: hit, x: clientX, y: clientY })
          }
          setDragShake(true)
          window.setTimeout(() => setDragShake(false), 240)
          window.setTimeout(() => stopDragRef.current(), 240)
          return
        }
        const from = d.startVertexId
        if (!from) return setDragBoth(null)
        const edgeId = canFinishHyperlane(st, pid, from, hit)
        if (edgeId) {
          buildHyperlane(edgeId)
          emitHoloPulseEdge(edgeId)
          playToneRef.current(196, 70, 'sawtooth', 0.05)
          return setDragBoth(null)
        }
        return setDragBoth(null)
      }

      if (d.kind === 'warp') {
        if (d.step === 1) {
          if (canStartWarpAt(st, pid, hit)) {
            setEventToast({ text: 'Warp-Lane: Zielpunkt wählen · ESC: Abbrechen', untilMs: nowMs + 1600 })
            return setDragBoth({ kind: 'warp', step: 2, startVertexId: hit, x: clientX, y: clientY })
          }
          setDragShake(true)
          window.setTimeout(() => setDragShake(false), 240)
          window.setTimeout(() => stopDragRef.current(), 240)
          return
        }
        const from = d.startVertexId
        if (!from) return setDragBoth(null)
        if (canFinishWarp(st, from, hit)) {
          buildWarpLane({ fromVertexId: from, toVertexId: hit })
          emitHoloPulseVertex(from)
          emitHoloPulseVertex(hit)
          playToneRef.current(196, 70, 'sawtooth', 0.05)
          return setDragBoth(null)
        }
        setDragShake(true)
        window.setTimeout(() => setDragShake(false), 240)
        window.setTimeout(() => stopDragRef.current(), 240)
        return
      }
    }
  }, [
    buildHyperlane,
    buildStation,
    buildWarpLane,
    emitHoloPulseEdge,
    emitHoloPulseVertex,
    resolveWormhole,
    upgradeStarbase,
    state,
    meId,
    visualStyle,
    vById,
  ])

  useEffect(() => {
    if (!state || state.events.length === 0) return
    const last = state.events[state.events.length - 1]
    if (!last) return
    if (lastEventIdRef.current === last.id) return
    lastEventIdRef.current = last.id

    const myName = state.players.find((p) => p.id === meId)?.name ?? null
    if (myName) {
      const mine =
        last.text.startsWith(`${myName}: Handelsangebot nicht möglich`) ||
        last.text.startsWith(`${myName}: Handelsangebot abgelehnt`) ||
        last.text.includes(`${myName} hat diese Runde bereits`)
      if (mine) {
        setEventToast({ text: last.text, untilMs: nowMs + 1700 })
        if (openMenuRef.current === 'market') {
          if (last.text.includes('Handelsangebot nicht möglich')) {
            const n = state.tradeOffersThisRound?.[meId] ?? null
            const suffix = typeof n === 'number' && n > 0 ? ` (${n}/10)` : ''
            setDealNotice({ text: `Niemand hat die gewünschten Rohstoffe${suffix}`, kind: 'bad' })
            pendingTradeOfferCreateRef.current = null
          }
          else if (last.text.includes('Zeitlimit')) setDealNotice({ text: 'Niemand hat angenommen', kind: 'bad' })
          else setDealNotice({ text: last.text, kind: 'info' })
        }
        return
      }
    }

    if (last.text.includes('tauscht am Schwarzmarkt')) {
      playToneRef.current(523, 80, 'triangle', 0.06)
      window.setTimeout(() => playToneRef.current(659, 120, 'triangle', 0.05), 85)
      return
    }
    if (last.text.includes('baut') || last.text.includes('Upgrade')) {
      playToneRef.current(196, 70, 'sawtooth', 0.05)
      window.setTimeout(() => playToneRef.current(247, 120, 'sawtooth', 0.04), 70)
      return
    }
    if (last.text.includes('Äußerer Ring rotiert')) {
      playToneRef.current(140, 220, 'sine', 0.04)
      setEventToast({ text: 'Äußerer Ring rotiert', untilMs: nowMs + 1700 })
      return
    }
    if (last.text.includes('Wurmloch') || last.text.includes('Black Hole')) {
      setEventToast({ text: 'Wurmloch wird versetzt', untilMs: nowMs + 1500 })
      return
    }
    if (last.text.includes('würfelt')) {
      setEventToast({ text: last.text, untilMs: nowMs + 1500 })
      return
    }
  }, [state?.events.length])

  useEffect(() => {
    if (!state) return
    if (!openMenuRef.current || openMenuRef.current !== 'market') return

    const currentTurnPlayerId = state.players[state.currentPlayerIndex]?.id ?? null
    if (!currentTurnPlayerId) return

    const latest = state.tradeOffers
      .slice()
      .reverse()
      .find((o) => o.fromPlayerId === currentTurnPlayerId) ?? null
    if (!latest) return

    const prev = lastTradeOfferStatusRef.current
    const prevId = prev?.offerId ?? null
    const prevStatus = prev?.status ?? null
    const nextStatus = latest.status

    if (prevId !== latest.id) {
      lastTradeOfferStatusRef.current = { offerId: latest.id, status: nextStatus }
      return
    }
    if (prevStatus === nextStatus) return
    lastTradeOfferStatusRef.current = { offerId: latest.id, status: nextStatus }

    if (nextStatus === 'accepted') {
      const isMine = currentTurnPlayerId === meId
      const isMyAccept = Boolean(pendingTradeAcceptRef.current && pendingTradeAcceptRef.current === latest.id)
      if (isMine) setMarketTab('players')
      if (!isMine && !isMyAccept) return
      setDealNotice({ text: 'Tausch erfolgreich', kind: 'ok' })
      if (isMine) {
        setOfferGive({})
        setOfferWant({})
        pendingTradeOfferCreateRef.current = null
      }
      window.setTimeout(() => {
        const shouldClose =
          currentTurnPlayerId === meId || (pendingTradeAcceptRef.current && pendingTradeAcceptRef.current === latest.id)
        pendingTradeAcceptRef.current = null
        if (shouldClose && openMenuRef.current === 'market') setOpenMenu(null)
      }, 1000)
      return
    }
    if ((nextStatus === 'expired' || nextStatus === 'declined') && currentTurnPlayerId === meId) {
      setDealNotice({ text: 'Niemand hat angenommen', kind: 'bad' })
      return
    }
  }, [state?.tradeOffers?.length, state?.tradeOffers?.[state.tradeOffers.length - 1]?.id, state?.tradeOffers?.[state.tradeOffers.length - 1]?.status, state?.currentPlayerIndex])

  useEffect(() => {
    if (!state) return
    const pending = pendingTradeOfferCreateRef.current
    if (!pending) return
    if (!meId) return

    const openMine = state.tradeOffers.some((o) => o.status === 'open' && o.fromPlayerId === meId && o.createdAt >= pending.startedAtMs - 50)
    if (openMine) {
      pendingTradeOfferCreateRef.current = null
      setOfferGive({})
      setOfferWant({})
      return
    }

    if (Date.now() - pending.startedAtMs > 1600) {
      pendingTradeOfferCreateRef.current = null
    }
  }, [state?.tradeOffers.length, meId])

  useEffect(() => {
    setNowMs(Date.now())
    const t = window.setInterval(() => setNowMs(Date.now()), 50)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!state) return
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const rect = parent.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const assets = assetsRef.current
    const bounds = computeBounds(state.board.vertices)
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
    const pad = 40
    const dx = Math.max(1, bounds.maxX - bounds.minX)
    const dy = Math.max(1, bounds.maxY - bounds.minY)
    const fitScale = Math.min((rect.width - pad * 2) / dx, (rect.height - pad * 2) / dy)
    const zoomFactors = [1.0, 1.35, 1.8] as const
    const scale = fitScale * zoomFactors[zoomLevel]
    const toPx = (p: { x: number; y: number }) => ({
      x: (p.x - center.x) * scale + rect.width / 2 + panRef.current.x,
      y: (p.y - center.y) * scale + rect.height / 2 + panRef.current.y,
    })
    transformRef.current = {
      canvasRect: canvas.getBoundingClientRect(),
      centerX: center.x,
      centerY: center.y,
      scale,
      panX: panRef.current.x,
      panY: panRef.current.y,
      width: rect.width,
      height: rect.height,
    }

    ctx.clearRect(0, 0, rect.width, rect.height)

    const isHolo = visualStyle === 'holo'
    if (isHolo) {
      const bg = ctx.createLinearGradient(0, 0, 0, rect.height)
      bg.addColorStop(0, 'rgba(2, 6, 23, 1)')
      bg.addColorStop(1, 'rgba(1, 3, 10, 1)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, rect.width, rect.height)

      let seed = 0
      const sid = state.id
      for (let i = 0; i < sid.length; i++) seed = (seed * 31 + sid.charCodeAt(i)) >>> 0
      const rand01 = (i: number) => {
        let x = (seed ^ (i * 0x9e3779b1)) >>> 0
        x ^= x << 13
        x ^= x >>> 17
        x ^= x << 5
        return ((x >>> 0) % 100000) / 100000
      }

      const driftX = (nowMs / 60000) % 1
      const driftY = (nowMs / 85000) % 1
      const pxOffX = -panRef.current.x * 0.18
      const pxOffY = -panRef.current.y * 0.18

      ctx.save()
      ctx.globalAlpha = 0.9
      for (let i = 0; i < 120; i++) {
        const rx = (rand01(i * 2 + 1) + driftX) % 1
        const ry = (rand01(i * 2 + 2) + driftY) % 1
        const x = rx * rect.width + pxOffX
        const y = ry * rect.height + pxOffY
        const r = 0.6 + rand01(i * 7 + 3) * 1.6
        const a = 0.15 + rand01(i * 11 + 4) * 0.45
        ctx.fillStyle = `rgba(226, 232, 240, ${a})`
        ctx.beginPath()
        ctx.arc(((x % rect.width) + rect.width) % rect.width, ((y % rect.height) + rect.height) % rect.height, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    const isOuter = (t: BoardTile) => axialDistance(t.q, t.r) === state.board.radius
    const rotateActive = Boolean(rotateAnim && nowMs < rotateAnim.startMs + rotateAnim.durationMs)
    const interactionBoost = Boolean(isHolo && (mode !== 'none' || drag || hoverVertexId || hoverEdgeId || pendingVertex || pendingWarpFrom))

    const boardDimFilter = isHolo ? 'saturate(0.45) brightness(0.74) contrast(1.08)' : 'saturate(0.6) brightness(0.82) contrast(1.06)'
    const boardTintBase = selectedPlayerId ? (isHolo ? 0.14 : 0.12) : isHolo ? 0.24 : 0.18
    const boardTintA = Math.min(0.32, boardTintBase + (interactionBoost ? 0.03 : 0))
    const playerPopFilter = isHolo ? 'saturate(1.35) brightness(1.12) contrast(1.06)' : 'saturate(1.22) brightness(1.08) contrast(1.04)'

    const tileOutlineBack = isHolo ? 'rgba(10, 20, 34, 0.72)' : 'rgba(10, 20, 34, 0.88)'
    const tileOutlineBackW = isHolo ? 2.7 : 3.2
    const tileOutlineFront = isHolo ? 'rgba(182, 216, 232, 0.22)' : 'rgba(182, 216, 232, 0.55)'
    const tileOutlineFrontW = isHolo ? 0.9 : 1.3

    ctx.lineWidth = 2
    ctx.globalAlpha = 1
    let bhRendered = false
    const singularityTile = state.board.tiles.find((t) => t.biome === 'singularity') ?? null
    const singularityPx = singularityTile ? toPx(singularityTile.center) : null

    for (const tile of state.board.tiles) {
      ctx.save()
      ctx.globalAlpha = selectedPlayerId && tile.biome !== 'singularity' && tile.id !== state.blackHoleTileId ? 0.26 : 1
      const cornerVerts = tile.cornerVertexIds.map((id) => vById.get(id)).filter((v): v is BoardVertex => Boolean(v))
      if (cornerVerts.length !== tile.cornerVertexIds.length) {
        ctx.restore()
        continue
      }
      const corners = cornerVerts.map(toPx)
      ctx.beginPath()
      ctx.moveTo(corners[0]!.x, corners[0]!.y)
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y)
      ctx.closePath()
      ctx.filter = boardDimFilter
      ctx.fillStyle = tileBgColor(tile.biome)
      ctx.fill()
      if (tile.id === state.blackHoleTileId && tile.biome !== 'singularity') {
        ctx.save()
        ctx.globalAlpha = 0.38
        ctx.fillStyle = 'rgba(0,0,0,1)'
        ctx.fill()
        ctx.restore()
      }

      const c = toPx(tile.center)
      const outerR = Math.hypot(corners[0]!.x - c.x, corners[0]!.y - c.y)
      const inscribed = outerR * 0.86

      if (tile.biome === 'singularity') {
        ctx.save()
        ctx.clip()
        const art = assets.tile_singularity
        if (art && art.complete && art.naturalWidth > 0) {
          const drawSize = outerR * 2.06
          ctx.globalAlpha = 0.98
          ctx.translate(c.x, c.y)
          const periodMs = 25000
          const angle = ((nowMs % periodMs) / periodMs) * Math.PI * 2
          ctx.rotate(angle)
          ctx.translate(-c.x, -c.y)
          ctx.drawImage(art, c.x - drawSize / 2, c.y - drawSize / 2, drawSize, drawSize)
          ctx.globalAlpha = 1
        }
        ctx.restore()
      } else {
        ctx.save()
        ctx.clip()
        const svgKey =
          tile.biome === 'nebula'
            ? 'tile_nebula'
            : tile.biome === 'asteroid'
              ? 'tile_asteroid'
              : tile.biome === 'frozen'
                ? 'tile_frozen'
                : tile.biome === 'farm'
                  ? 'tile_farm'
                  : tile.biome === 'ruins'
                    ? 'tile_ruins'
                    : null
        const art = svgKey ? assets[svgKey] : null
        if (art && art.complete && art.naturalWidth > 0) {
          const drawSize = outerR * 1.88
          ctx.globalAlpha = 0.9
          ctx.drawImage(art, c.x - drawSize / 2, c.y - drawSize / 2, drawSize, drawSize)
          ctx.globalAlpha = 1
        } else {
          drawBiomeIllustration(ctx, tile.biome, c, inscribed, `${tile.id}|${tile.biome}`)
        }
        ctx.restore()
      }

      ctx.save()
      ctx.globalAlpha = boardTintA
      ctx.fillStyle = 'rgba(2, 8, 18, 1)'
      ctx.fill()
      ctx.restore()
      ctx.filter = 'none'

      if (tile.id === state.blackHoleTileId) {
        const boosted = nowMs < bhBoostUntilMs
        const showVideo = mode !== 'blackhole'
        const vidScale = boosted ? 1.55 : 1.25
        const vidSize = inscribed * vidScale
        if (singularityPx && tile.biome !== 'singularity') {
          ctx.save()
          const g = ctx.createLinearGradient(c.x, c.y, singularityPx.x, singularityPx.y)
          g.addColorStop(0, 'rgba(0,245,255,0.10)')
          g.addColorStop(1, 'rgba(168,85,247,0.10)')
          ctx.strokeStyle = g
          ctx.lineWidth = 5
          ctx.globalAlpha = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(nowMs / 180))
          ctx.setLineDash([14, 10])
          ctx.lineDashOffset = -nowMs / 30
          ctx.beginPath()
          ctx.moveTo(c.x, c.y)
          ctx.quadraticCurveTo((c.x + singularityPx.x) / 2, (c.y + singularityPx.y) / 2 - inscribed * 0.35, singularityPx.x, singularityPx.y)
          ctx.stroke()
          ctx.restore()
        }

        if (state.phase === 'wormhole') {
          ctx.save()
          ctx.globalAlpha = 0.35
          ctx.fillStyle = 'rgba(0,0,0,1)'
          ctx.beginPath()
          ctx.moveTo(corners[0]!.x, corners[0]!.y)
          for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }

        bhRendered = true
        if (bhVidRef.current) {
          bhVidRef.current.style.display = showVideo ? 'block' : 'none'
          bhVidRef.current.style.left = `${c.x - vidSize / 2}px`
          bhVidRef.current.style.top = `${c.y - vidSize / 2}px`
          bhVidRef.current.style.width = `${vidSize}px`
          bhVidRef.current.style.height = `${vidSize}px`
        }
      }

      if (
        productionHighlightSum &&
        tile.numberToken === productionHighlightSum &&
        tile.id !== state.blackHoleTileId &&
        tile.biome !== 'singularity'
      ) {
        ctx.save()
        const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(nowMs / 140))
        ctx.fillStyle = tileGlowColor(tile.biome)
        ctx.globalAlpha = 0.25 + 0.55 * pulse
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.shadowColor = tileGlowColor(tile.biome)
        ctx.shadowBlur = 12 + 20 * pulse
        ctx.lineWidth = 3 + 4 * pulse
        ctx.strokeStyle = tileGlowColor(tile.biome)
        ctx.setLineDash([10, 10])
        ctx.lineDashOffset = -nowMs / 24
        ctx.stroke()
        ctx.setLineDash([])
        ctx.shadowBlur = 0
        ctx.restore()
      }

      ctx.beginPath()
      ctx.moveTo(corners[0]!.x, corners[0]!.y)
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y)
      ctx.closePath()

      ctx.strokeStyle = tileOutlineBack
      ctx.lineWidth = tileOutlineBackW
      ctx.stroke()
      ctx.strokeStyle = tileOutlineFront
      ctx.lineWidth = tileOutlineFrontW
      ctx.stroke()
      ctx.lineWidth = 2

      const skipOuterContent = rotateActive && isOuter(tile)
      if (tile.numberToken && !skipOuterContent && tile.id !== state.blackHoleTileId) {
        const ny = c.y
        const token = tokenColorByProbability(tile.numberToken)
        const scaleF = tokenScaleByProbability(tile.numberToken)
        const r = Math.max(12, inscribed * 0.29 * scaleF)
        ctx.beginPath()
        ctx.fillStyle = 'rgba(248, 250, 252, 0.92)'
        ctx.arc(c.x, ny, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = 2.4
        ctx.strokeStyle = token.ring
        ctx.stroke()
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(8, 18, 30, 0.45)'
        ctx.stroke()
        ctx.fillStyle = token.text
        ctx.font = `900 ${Math.max(14, inscribed * 0.285) * scaleF}px system-ui`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'rgba(255,255,255,0.45)'
        ctx.shadowBlur = 2
        ctx.fillText(String(tile.numberToken), c.x, ny + 1.5)
        ctx.shadowBlur = 0
      }
      ctx.restore()
    }
    ctx.globalAlpha = 1

    if (!bhRendered && bhVidRef.current) {
      bhVidRef.current.style.display = 'none'
    }

    if (rotateActive && rotateAnim) {
      const progress = (nowMs - rotateAnim.startMs) / rotateAnim.durationMs
      const tProg = progress < 0 ? 0 : progress > 1 ? 1 : progress
      const ease = tProg < 0.5 ? 4 * tProg * tProg * tProg : 1 - Math.pow(-2 * tProg + 2, 3) / 2
      for (const e of rotateAnim.entries) {
        const from = toPx(e.from)
        const to = toPx(e.to)
        const x = from.x + (to.x - from.x) * ease
        const y = from.y + (to.y - from.y) * ease
        const r = 26
        ctx.save()
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6
          const px = x + Math.cos(a) * r
          const py = y + Math.sin(a) * r
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.filter = boardDimFilter
        ctx.fillStyle = tileBgColor(e.biome)
        ctx.fill()
        ctx.save()
        ctx.clip()
        const svgKey =
          e.biome === 'nebula'
            ? 'tile_nebula'
            : e.biome === 'asteroid'
              ? 'tile_asteroid'
              : e.biome === 'frozen'
                ? 'tile_frozen'
                : e.biome === 'farm'
                  ? 'tile_farm'
                  : e.biome === 'ruins'
                    ? 'tile_ruins'
                    : null
        const art = svgKey ? assets[svgKey] : null
        if (art && art.complete && art.naturalWidth > 0) {
          const drawSize = r * 1.88
          ctx.globalAlpha = 0.9
          ctx.drawImage(art, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize)
          ctx.globalAlpha = 1
        } else {
          drawBiomeIllustration(ctx, e.biome, { x, y }, r * 0.9, `rot:${e.biome}:${e.numberToken ?? ''}:${x.toFixed(2)}:${y.toFixed(2)}`)
        }
        ctx.restore()
        ctx.save()
        ctx.globalAlpha = boardTintA
        ctx.fillStyle = 'rgba(2, 8, 18, 1)'
        ctx.fill()
        ctx.restore()
        ctx.filter = 'none'
        ctx.lineWidth = isHolo ? 2.1 : 2.2
        ctx.strokeStyle = isHolo ? 'rgba(10, 20, 34, 0.68)' : 'rgba(10, 20, 34, 0.78)'
        ctx.stroke()
        ctx.restore()
        if (e.numberToken) {
          const ny = y
          const token = tokenColorByProbability(e.numberToken)
          const scaleF = tokenScaleByProbability(e.numberToken)
          ctx.beginPath()
          ctx.fillStyle = 'rgba(248, 250, 252, 0.9)'
          ctx.arc(x, ny, 15.5 * scaleF, 0, Math.PI * 2)
          ctx.fill()
          ctx.lineWidth = 2.2
          ctx.strokeStyle = token.ring
          ctx.stroke()
          ctx.lineWidth = 1.8
          ctx.strokeStyle = 'rgba(8, 18, 30, 0.45)'
          ctx.stroke()
          ctx.fillStyle = token.text
          ctx.font = `900 ${16 * scaleF}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.shadowColor = 'rgba(255,255,255,0.4)'
          ctx.shadowBlur = 2
          ctx.fillText(String(e.numberToken), x, ny + 1.5)
          ctx.shadowBlur = 0
        }
      }
    }

    if (rotateFlash) {
      const dt = nowMs - rotateFlash.startMs
      if (dt >= 0 && dt < rotateFlash.durationMs) {
        const phase = Math.floor(dt / 500)
        if (phase % 2 === 0) {
          for (const e of rotateFlash.entries) {
            const dest = state.board.tiles.find((t) => t.id === e.destTileId)
            if (!dest) continue
            const cornerVerts = dest.cornerVertexIds.map((id) => vById.get(id)).filter((v): v is BoardVertex => Boolean(v))
            if (cornerVerts.length !== dest.cornerVertexIds.length) continue
            const corners = cornerVerts.map(toPx)
            const c = toPx(dest.center)
            const outerR = Math.hypot(corners[0]!.x - c.x, corners[0]!.y - c.y)
            const inscribed = outerR * 0.86
            ctx.save()
            ctx.globalAlpha = 0.72
            ctx.beginPath()
            ctx.moveTo(corners[0]!.x, corners[0]!.y)
            for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y)
            ctx.closePath()
            ctx.fillStyle = tileBgColor(e.biome)
            ctx.fill()
            ctx.save()
            ctx.clip()
            if (e.biome !== 'singularity') {
              const svgKey =
                e.biome === 'nebula'
                  ? 'tile_nebula'
                  : e.biome === 'asteroid'
                    ? 'tile_asteroid'
                    : e.biome === 'frozen'
                      ? 'tile_frozen'
                      : e.biome === 'farm'
                        ? 'tile_farm'
                        : e.biome === 'ruins'
                          ? 'tile_ruins'
                          : null
              const art = svgKey ? assets[svgKey] : null
              if (art && art.complete && art.naturalWidth > 0) {
                const drawSize = outerR * 1.88
                ctx.globalAlpha = 0.9
                ctx.drawImage(art, c.x - drawSize / 2, c.y - drawSize / 2, drawSize, drawSize)
                ctx.globalAlpha = 0.72
              }
            }
            ctx.restore()
            ctx.lineWidth = 3.2
            ctx.strokeStyle = 'rgba(10, 20, 34, 0.85)'
            ctx.stroke()
            if (e.numberToken && dest.id !== state.blackHoleTileId) {
              const ny = c.y
              const token = tokenColorByProbability(e.numberToken)
              const scaleF = tokenScaleByProbability(e.numberToken)
              const r = Math.max(12, inscribed * 0.29 * scaleF)
              ctx.beginPath()
              ctx.fillStyle = 'rgba(248, 250, 252, 0.92)'
              ctx.arc(c.x, ny, r, 0, Math.PI * 2)
              ctx.fill()
              ctx.lineWidth = 2.4
              ctx.strokeStyle = token.ring
              ctx.stroke()
              ctx.lineWidth = 2
              ctx.strokeStyle = 'rgba(8, 18, 30, 0.45)'
              ctx.stroke()
              ctx.fillStyle = token.text
              ctx.font = `900 ${Math.max(14, inscribed * 0.285) * scaleF}px system-ui`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(String(e.numberToken), c.x, ny + 1.5)
            }
            ctx.restore()
          }
          ctx.globalAlpha = 1
        }
      }
    }

    if (nowMs < ringRotateUntilMs) {
      const progress = 1 - (ringRotateUntilMs - nowMs) / 1700
      const ease = progress < 0 ? 0 : progress > 1 ? 1 : 1 - Math.pow(1 - progress, 3)
      const centerPx = { x: rect.width / 2 + panRef.current.x, y: rect.height / 2 + panRef.current.y }
      let outer = 0
      for (const v of state.board.vertices) {
        const p = toPx(v)
        outer = Math.max(outer, Math.hypot(p.x - centerPx.x, p.y - centerPx.y))
      }
      const r = outer - 10
      ctx.save()
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(210, 228, 241, 0.24)'
      ctx.setLineDash([10, 10])
      ctx.lineDashOffset = -ease * 140
      ctx.beginPath()
      ctx.arc(centerPx.x, centerPx.y, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      for (let i = 0; i < 6; i++) {
        const a = ease * Math.PI * 2 + (i * Math.PI) / 3
        const ax = centerPx.x + Math.cos(a) * r
        const ay = centerPx.y + Math.sin(a) * r
        const tx = centerPx.x + Math.cos(a) * (r + 14)
        const ty = centerPx.y + Math.sin(a) * (r + 14)
        ctx.strokeStyle = 'rgba(210, 228, 241, 0.28)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(tx, ty)
        ctx.stroke()
      }
      ctx.restore()
    }

    if (visualStyle === 'holo') {
      if (!holoNoisePatternRef.current) {
        const n = document.createElement('canvas')
        n.width = 128
        n.height = 128
        const nctx = n.getContext('2d')
        if (nctx) {
          const img = nctx.createImageData(n.width, n.height)
          for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.floor(Math.random() * 256)
            img.data[i] = v
            img.data[i + 1] = v
            img.data[i + 2] = v
            img.data[i + 3] = Math.floor(Math.random() * 60)
          }
          nctx.putImageData(img, 0, 0)
          holoNoisePatternRef.current = ctx.createPattern(n, 'repeat')
        }
      }

      ctx.save()
      ctx.globalCompositeOperation = 'screen'

      const pat = holoNoisePatternRef.current
      if (pat) {
        ctx.globalAlpha = 0.05
        ctx.fillStyle = pat
        ctx.fillRect(0, 0, rect.width, rect.height)
      }

      ctx.globalCompositeOperation = 'source-over'
      const vg = ctx.createRadialGradient(
        rect.width / 2,
        rect.height / 2,
        rect.height * 0.12,
        rect.width / 2,
        rect.height / 2,
        rect.height * 0.9,
      )
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.globalAlpha = 1
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, rect.width, rect.height)

      ctx.restore()
    }

    ctx.save()
    ctx.filter = playerPopFilter
    const laneBoost = interactionBoost ? 1.18 : 1
    for (const h of state.hyperlanes) {
      const e = state.board.edges.find((x) => x.id === h.edgeId)
      if (!e) continue
      const a = vById.get(e.a)
      const b = vById.get(e.b)
      if (!a || !b) continue
      const pa = toPx(a)
      const pb = toPx(b)
      const p = state.players.find((pl) => pl.id === h.playerId)
      const clr = p ? playerColor(p.color) : '#00f5ff'
      const isSelected = selectedPlayerId ? h.playerId === selectedPlayerId : false
      ctx.globalAlpha = selectedPlayerId ? (isSelected ? 1 : 0.14) : 1
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)'
      ctx.lineWidth = isHolo ? 10.6 : 8.4
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
      if (isHolo) {
        ctx.save()
        ctx.strokeStyle = clr
        ctx.lineWidth = 8.2
        ctx.shadowColor = clr
        ctx.shadowBlur = 30 * laneBoost
        ctx.globalAlpha *= 0.55
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
        ctx.stroke()
        ctx.restore()
      }

      ctx.strokeStyle = clr
      ctx.lineWidth = isHolo ? 6.2 : 5.4
      ctx.shadowColor = clr
      ctx.shadowBlur = (isSelected ? 18 : isHolo ? 10 : 0) * laneBoost
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.lineWidth = 4
    }
    ctx.globalAlpha = 1

    if (state.warpLanes.length > 0) {
      const centerPx = { x: rect.width / 2 + panRef.current.x, y: rect.height / 2 + panRef.current.y }
      let outer = 0
      for (const v of state.board.vertices) {
        const p = toPx(v)
        const d = Math.hypot(p.x - centerPx.x, p.y - centerPx.y)
        outer = Math.max(outer, d)
      }

      for (const w of state.warpLanes) {
        const a = vById.get(w.fromVertexId)
        const b = vById.get(w.toVertexId)
        if (!a || !b) continue
        const pa = toPx(a)
        const pb = toPx(b)
        const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
        const mv = { x: mid.x - centerPx.x, y: mid.y - centerPx.y }
        const ml = Math.max(1, Math.hypot(mv.x, mv.y))
        const mdir = { x: mv.x / ml, y: mv.y / ml }
        const ctrl = { x: centerPx.x + mdir.x * (outer + 80), y: centerPx.y + mdir.y * (outer + 80) }

        const av = { x: pa.x - centerPx.x, y: pa.y - centerPx.y }
        const al = Math.max(1, Math.hypot(av.x, av.y))
        const adir = { x: av.x / al, y: av.y / al }
        const bv = { x: pb.x - centerPx.x, y: pb.y - centerPx.y }
        const bl = Math.max(1, Math.hypot(bv.x, bv.y))
        const bdir = { x: bv.x / bl, y: bv.y / bl }
        const start = { x: pa.x + adir.x * 10, y: pa.y + adir.y * 10 }
        const end = { x: pb.x + bdir.x * 10, y: pb.y + bdir.y * 10 }

        const p = state.players.find((pl) => pl.id === w.playerId)
        const clr = p ? playerColor(p.color) : '#00f5ff'
        const isSelected = selectedPlayerId ? w.playerId === selectedPlayerId : false
        ctx.globalAlpha = selectedPlayerId ? (isSelected ? 1 : 0.14) : 1
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)'
        ctx.lineWidth = isHolo ? 10.6 : 8.4
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y)
        ctx.stroke()
        if (isHolo) {
          ctx.save()
          ctx.strokeStyle = clr
          ctx.lineWidth = 8.0
          ctx.shadowColor = clr
          ctx.shadowBlur = 32 * laneBoost
          ctx.globalAlpha *= 0.5
          ctx.beginPath()
          ctx.moveTo(start.x, start.y)
          ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y)
          ctx.stroke()
          ctx.restore()
        }
        ctx.strokeStyle = clr
        ctx.lineWidth = isHolo ? 5.8 : 5
        ctx.shadowColor = clr
        ctx.shadowBlur = (isSelected ? 20 : isHolo ? 10 : 0) * laneBoost
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y)
        ctx.stroke()
        ctx.shadowBlur = 0
      }
      ctx.globalAlpha = 1
    }

    for (const s of state.stations) {
      const v = vById.get(s.vertexId)
      if (!v) continue
      const p = state.players.find((pl) => pl.id === s.playerId)
      const c = toPx(v)
      const color = p?.color ?? 'blue'
      const key = s.level === 'starbase' ? `starbase_${color}` : `station_${color}`
      const img = assets[key]
      const playerClr = p ? playerColor(p.color) : '#00f5ff'
      const isSelected = selectedPlayerId ? s.playerId === selectedPlayerId : false
      const hash = Array.from(s.vertexId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      const pulse = 0.85 + 0.15 * Math.sin(nowMs / 220 + hash)
      const size = (s.level === 'starbase' ? 56 : 48) * (0.98 + pulse * 0.06)
      const ringR = (size / 2) * 0.92
      ctx.save()
      ctx.globalAlpha = selectedPlayerId ? (isSelected ? 1 : 0.22) : 1
      const buildingBoost = interactionBoost ? 1.15 : 1
      const backW = isHolo ? 10.6 : 8.4
      const frontW = isHolo ? 6.2 : 5.4

      if (isHolo) {
        ctx.save()
        ctx.globalAlpha *= 0.65
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
        ctx.shadowBlur = 22 * buildingBoost
        ctx.beginPath()
        ctx.ellipse(c.x + 2, c.y + ringR * 0.45, ringR * 0.9, ringR * 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      if (s.level === 'starbase') {
        const innerR = ringR - 7
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)'
        ctx.lineWidth = backW
        ctx.shadowColor = 'rgba(0,0,0,0.65)'
        ctx.shadowBlur = (isHolo ? 18 : 12) * buildingBoost
        ctx.arc(c.x, c.y, ringR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.shadowBlur = (isHolo ? 16 : 10) * buildingBoost
        ctx.arc(c.x, c.y, innerR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = playerClr
        ctx.lineWidth = frontW
        ctx.beginPath()
        ctx.shadowColor = isSelected ? playerClr : 'rgba(0,0,0,0.65)'
        ctx.shadowBlur = (isSelected ? 22 : isHolo ? 18 : 12) * buildingBoost
        ctx.arc(c.x, c.y, ringR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.shadowBlur = (isSelected ? 20 : isHolo ? 16 : 10) * buildingBoost
        ctx.arc(c.x, c.y, innerR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.shadowBlur = 0
      } else {
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)'
        ctx.lineWidth = backW
        ctx.shadowColor = 'rgba(0,0,0,0.65)'
        ctx.shadowBlur = (isHolo ? 18 : 12) * buildingBoost
        ctx.arc(c.x, c.y, ringR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = playerClr
        ctx.lineWidth = frontW
        ctx.beginPath()
        ctx.shadowColor = isSelected ? playerClr : 'rgba(0,0,0,0.65)'
        ctx.shadowBlur = (isSelected ? 22 : isHolo ? 18 : 12) * buildingBoost
        ctx.arc(c.x, c.y, ringR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.shadowBlur = 0
      }
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.shadowColor = 'rgba(0,0,0,0.55)'
        ctx.shadowBlur = (isHolo ? 10 : 6) * buildingBoost
        ctx.drawImage(img, c.x - size / 2, c.y - size / 2, size, size)
      } else {
        const r = s.level === 'starbase' ? 8 : 6
        ctx.beginPath()
        ctx.fillStyle = playerClr
        ctx.shadowColor = ctx.fillStyle
        ctx.shadowBlur = (isHolo ? 18 : 12) * buildingBoost
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      ctx.restore()
    }
    ctx.restore()

    if (visualStyle === 'holo' && holoFxRef.current.length) {
      const keep: typeof holoFxRef.current = []
      for (const fx of holoFxRef.current) {
        const age = nowMs - fx.startMs
        const dur = 850
        if (age < 0 || age > dur) continue
        const t = age / dur
        const a = Math.max(0, 1 - t)
        keep.push(fx)

        if (fx.kind === 'pulse_vertex') {
          const v = vById.get(fx.vertexId)
          if (!v) continue
          const p = toPx(v)
          const r = 10 + 28 * t
          ctx.save()
          ctx.globalAlpha = 0.85 * a * a
          ctx.strokeStyle = fx.color
          ctx.lineWidth = 3
          ctx.shadowColor = fx.color
          ctx.shadowBlur = 18 * a
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 0.12 * a
          ctx.fillStyle = fx.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, r - 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          continue
        }

        if (fx.kind === 'pulse_edge') {
          const e = state.board.edges.find((x) => x.id === fx.edgeId)
          if (!e) continue
          const va = vById.get(e.a)
          const vb = vById.get(e.b)
          if (!va || !vb) continue
          const pa = toPx(va)
          const pb = toPx(vb)
          ctx.save()
          ctx.globalAlpha = 0.7 * a * a
          ctx.strokeStyle = fx.color
          ctx.lineWidth = 6
          ctx.lineCap = 'round'
          ctx.shadowColor = fx.color
          ctx.shadowBlur = 22 * a
          ctx.setLineDash([18, 12])
          ctx.lineDashOffset = -nowMs / 22
          ctx.beginPath()
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.restore()
        }
      }
      holoFxRef.current = keep
    }

    if (hoverVertexId) {
      const hv = vById.get(hoverVertexId)
      if (hv) {
        const p = toPx(hv)
        const hoverKind = dragRef.current?.kind ?? mode
        const hoverAllowed =
          state.phase === 'main' && isMyTurn && (hoverKind === 'station' || hoverKind === 'upgrade')
            ? hoverKind === 'station'
              ? canPlaceStationAt(state, meId, hoverVertexId)
              : canUpgradeAt(state, meId, hoverVertexId)
            : null
        ctx.save()
        ctx.beginPath()
        ctx.fillStyle = 'rgba(241, 245, 249, 0.18)'
        ctx.strokeStyle =
          hoverAllowed === null
            ? 'rgba(241, 245, 249, 0.85)'
            : hoverAllowed
              ? 'rgba(0, 245, 255, 0.95)'
              : 'rgba(248, 113, 113, 0.95)'
        ctx.lineWidth = 2
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }

    const activeDrag = dragRef.current
    const showHints =
      isMyTurn &&
      state.phase === 'main' &&
      (Boolean(activeDrag) || mode === 'hyperlane' || mode === 'station' || mode === 'upgrade')
    if (showHints) {
      ctx.save()
      ctx.shadowBlur = 0
      const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(nowMs / 140))
      const okOutlineA = 0.55 + 0.25 * blink
      const okInnerA = 0.35 + 0.45 * blink
      const okFillA = 0.05 + 0.07 * blink

      const drawVertexHint = (vertexId: string, isAllowed: boolean) => {
        const v = vById.get(vertexId)
        if (!v) return
        const p = toPx(v)
        const r = 11
        if (isAllowed) {
          ctx.save()
          ctx.beginPath()
          ctx.strokeStyle = `rgba(6, 10, 18, ${okOutlineA})`
          ctx.lineWidth = 9
          ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2)
          ctx.stroke()

          ctx.beginPath()
          ctx.fillStyle = `rgba(0, 245, 255, ${okFillA})`
          ctx.arc(p.x, p.y, r - 1, 0, Math.PI * 2)
          ctx.fill()

          ctx.beginPath()
          ctx.strokeStyle = `rgba(0, 245, 255, ${okInnerA})`
          ctx.lineWidth = 5
          ctx.shadowColor = 'rgba(0, 245, 255, 0.55)'
          ctx.shadowBlur = 18
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.restore()
          return
        }

        ctx.save()
        ctx.beginPath()
        ctx.fillStyle = 'rgba(148, 163, 184, 0.05)'
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.26)'
        ctx.lineWidth = 2
        ctx.arc(p.x, p.y, r - 1, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        ctx.beginPath()
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.55)'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.moveTo(p.x - 7, p.y - 7)
        ctx.lineTo(p.x + 7, p.y + 7)
        ctx.stroke()
        ctx.restore()
      }

      if (activeDrag?.kind === 'blackhole') {
        for (const tile of state.board.tiles) {
          if (tile.biome === 'singularity') continue
          const cornerVerts = tile.cornerVertexIds.map((id) => vById.get(id)).filter((v): v is BoardVertex => Boolean(v))
          if (cornerVerts.length !== tile.cornerVertexIds.length) continue
          const corners = cornerVerts.map(toPx)
          ctx.beginPath()
          ctx.moveTo(corners[0]!.x, corners[0]!.y)
          for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
      } else if (state.phase === 'main') {
        if (activeDrag?.kind === 'station' || mode === 'station') {
          for (const v of state.board.vertices) {
            const allowed = canPlaceStationAt(state, meId, v.id)
            drawVertexHint(v.id, allowed)
          }
        } else if (activeDrag?.kind === 'upgrade' || mode === 'upgrade') {
          for (const s of state.stations) {
            if (s.playerId !== meId) continue
            const allowed = canUpgradeAt(state, meId, s.vertexId)
            drawVertexHint(s.vertexId, allowed)
          }
        } else if (mode === 'hyperlane') {
          const validEdges = state.board.edges.filter((e) => canBuildHyperlaneEdge(state, meId, e))
          if (validEdges.length) {
            for (const e of validEdges) {
              const a = vById.get(e.a)
              const b = vById.get(e.b)
              if (!a || !b) continue
              const pa = toPx(a)
              const pb = toPx(b)
              ctx.save()
              ctx.strokeStyle = `rgba(6, 10, 18, ${okOutlineA})`
              ctx.lineWidth = 11
              ctx.lineCap = 'round'
              ctx.beginPath()
              ctx.moveTo(pa.x, pa.y)
              ctx.lineTo(pb.x, pb.y)
              ctx.stroke()
              ctx.strokeStyle = `rgba(0, 245, 255, ${okInnerA})`
              ctx.lineWidth = 6
              ctx.shadowColor = 'rgba(0, 245, 255, 0.55)'
              ctx.shadowBlur = 18
              ctx.beginPath()
              ctx.moveTo(pa.x, pa.y)
              ctx.lineTo(pb.x, pb.y)
              ctx.stroke()
              ctx.shadowBlur = 0
              ctx.restore()
            }
          }

          if (hoverEdgeId) {
            const e = state.board.edges.find((x) => x.id === hoverEdgeId)
            if (e) {
              const a = vById.get(e.a)
              const b = vById.get(e.b)
              if (a && b) {
                const pa = toPx(a)
                const pb = toPx(b)
                ctx.save()
                ctx.lineCap = 'round'
                ctx.setLineDash([14, 10])
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
                ctx.lineWidth = 12
                ctx.shadowColor = 'rgba(255, 255, 255, 0.55)'
                ctx.shadowBlur = 16
                ctx.beginPath()
                ctx.moveTo(pa.x, pa.y)
                ctx.lineTo(pb.x, pb.y)
                ctx.stroke()
                ctx.setLineDash([])
                ctx.shadowBlur = 0
                ctx.restore()
              }
            }
          }
        } else if (activeDrag?.kind === 'warp') {
          if (activeDrag.step === 1) {
            for (const s of state.stations) {
              if (s.playerId !== meId) continue
              drawVertexHint(s.vertexId, canStartWarpAt(state, meId, s.vertexId))
            }
          } else {
            const from = activeDrag.startVertexId
            if (from) drawVertexHint(from, true)
            for (const v of state.board.vertices) {
              if (!from) continue
              const allowed = canFinishWarp(state, from, v.id)
              if (allowed) drawVertexHint(v.id, true)
            }
          }
        }
      }
      ctx.restore()
    }
  }, [
    state,
    vById,
    assetsVersion,
    assetsRef,
    zoomLevel,
    pan,
    drag,
    mode,
    isMyTurn,
    meId,
    pendingVertex,
    hoverVertexId,
    hoverEdgeId,
    neighborsByVertex,
    eByKey,
    nowMs,
    ringRotateUntilMs,
    visualStyle,
  ])

  useEffect(() => {
    if (!state) return
    const prev = prevStateRef.current
    prevStateRef.current = state
    if (!prev) return

    const roll = state.lastDiceRoll
    const didProduce = Boolean(roll && roll.sum !== 7 && prev.phase === 'await_roll' && state.phase === 'main')
    if (!didProduce) return

    for (const id of productionAnimTimeoutsRef.current) window.clearTimeout(id)
    productionAnimTimeoutsRef.current = []
    setProductionHighlightSum(null)

    const producingTiles = state.board.tiles.filter(
      (t) => t.numberToken === roll!.sum && t.id !== state.blackHoleTileId && t.biome !== 'singularity',
    )

    const toPosByPlayerId = new Map<string, { x: number; y: number }>()
    for (const p of state.players) {
      const el = cornerRefByPlayerId.current[p.id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      toPosByPlayerId.set(p.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
    }

    const deltas: Array<{ playerId: string; resource: Resource; count: number }> = []
    for (const p of state.players) {
      const prevP = prev.players.find((x) => x.id === p.id)
      if (!prevP) continue
      for (const r of Object.keys(p.resources) as Resource[]) {
        const diff = (p.resources[r] ?? 0) - (prevP.resources[r] ?? 0)
        if (diff > 0) deltas.push({ playerId: p.id, resource: r, count: diff })
      }
    }
    const swallowItems: Array<{ resource: Resource; tileId: string }> = []
    const bhTile = state.board.tiles.find((t) => t.id === state.blackHoleTileId)
    if (bhTile && bhTile.numberToken === roll!.sum && bhTile.biome !== 'singularity') {
      const res = tileResource(bhTile.biome)
      if (!res) return
      const stations = state.stations.filter((s) => bhTile.cornerVertexIds.includes(s.vertexId))
      const total = Math.min(
        12,
        stations.reduce((acc, s) => acc + (s.level === 'starbase' ? 2 : 1), 0),
      )
      for (let i = 0; i < total; i++) swallowItems.push({ resource: res, tileId: bhTile.id })
    }

    const queue: Array<{ playerId: string; resource: Resource; tileId: string | null }> = []
    for (const d of deltas) {
      const cap = Math.min(8, d.count)
      for (let i = 0; i < cap; i++) {
        const candidates = producingTiles.filter(
          (t) =>
            tileResource(t.biome) === d.resource &&
            t.cornerVertexIds.some((vid) => state.stations.some((s) => s.playerId === d.playerId && s.vertexId === vid)),
        )
        const picked = candidates[Math.floor(Math.random() * candidates.length)]
        queue.push({ playerId: d.playerId, resource: d.resource, tileId: picked?.id ?? null })
        if (queue.length >= 24) break
      }
      if (queue.length >= 24) break
    }
    if (queue.length === 0 && swallowItems.length === 0) return

    const t1 = window.setTimeout(() => {
      setProductionHighlightSum(roll!.sum)
    }, 1000)
    productionAnimTimeoutsRef.current.push(t1)

    const t2 = window.setTimeout(() => {
      queue.forEach((q, idx) => {
        const t = window.setTimeout(() => {
          const to = toPosByPlayerId.get(q.playerId)
          if (!to) return
          const tr = transformRef.current
          let from: { x: number; y: number } | null = null
          if (tr && q.tileId) {
            const tile = state.board.tiles.find((x) => x.id === q.tileId)
            if (tile) {
              const px = (tile.center.x - tr.centerX) * tr.scale + tr.width / 2 + tr.panX
              const py = (tile.center.y - tr.centerY) * tr.scale + tr.height / 2 + tr.panY
              from = { x: tr.canvasRect.left + px, y: tr.canvasRect.top + py }
            }
          }
          if (!from && tr) from = { x: tr.canvasRect.left + tr.width / 2, y: tr.canvasRect.top + tr.height / 2 }
          if (!from) return

          const ev = {
            id: Math.random().toString(16).slice(2),
            resource: q.resource,
            fromX: from.x,
            fromY: from.y,
            toX: to.x,
            toY: to.y,
          }
          setResourceFx((fx) => fx.concat(ev))
          window.setTimeout(() => {
            setResourceFx((fx) => fx.filter((x) => x.id !== ev.id))
          }, 950)
        }, idx * 220)
        productionAnimTimeoutsRef.current.push(t)
      })

      swallowItems.forEach((q, idx) => {
        const t = window.setTimeout(() => {
          const tr = transformRef.current
          if (!tr) return
          const tile = state.board.tiles.find((x) => x.id === q.tileId)
          if (!tile) return
          const px = (tile.center.x - tr.centerX) * tr.scale + tr.width / 2 + tr.panX
          const py = (tile.center.y - tr.centerY) * tr.scale + tr.height / 2 + tr.panY
          const from = { x: tr.canvasRect.left + px, y: tr.canvasRect.top + py }
          const to = { x: tr.canvasRect.left + tr.width / 2, y: tr.canvasRect.top + tr.height / 2 }
          const ev = {
            id: Math.random().toString(16).slice(2),
            resource: q.resource,
            fromX: from.x,
            fromY: from.y,
            toX: to.x,
            toY: to.y,
          }
          setResourceFx((fx) => fx.concat(ev))
          window.setTimeout(() => {
            setResourceFx((fx) => fx.filter((x) => x.id !== ev.id))
          }, 950)
        }, (queue.length + idx) * 220)
        productionAnimTimeoutsRef.current.push(t)
      })

      const t3 = window.setTimeout(() => {
        setProductionHighlightSum(null)
      }, (queue.length + swallowItems.length) * 220 + 1000)
      productionAnimTimeoutsRef.current.push(t3)
    }, 2000)
    productionAnimTimeoutsRef.current.push(t2)
  }, [state])

  useEffect(() => {
    if (!state) return
    const pending = pendingBlackHoleTradeRef.current
    if (!pending) return

    const meLocal = state.players.find((p) => p.id === meId) ?? null
    if (!meLocal) return

    const giveHave = meLocal.resources[pending.give] ?? 0
    const receiveHave = meLocal.resources[pending.receive] ?? 0
    const poolGive = state.blackHolePool[pending.give] ?? 0
    const poolReceive = state.blackHolePool[pending.receive] ?? 0

    const ok =
      giveHave - pending.before.giveHave === -pending.rate &&
      receiveHave - pending.before.receiveHave === 1 &&
      poolGive - pending.before.poolGive === pending.rate &&
      poolReceive - pending.before.poolReceive === -1

    if (!ok) {
      if (Date.now() - pending.startedAtMs > 2500) {
        pendingBlackHoleTradeRef.current = null
      }
      return
    }

    pendingBlackHoleTradeRef.current = null

    const toEl = cornerRefByPlayerId.current[meId] ?? null
    const toRect = toEl?.getBoundingClientRect() ?? null
    const to = toRect ? { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 } : null

    const tr = transformRef.current
    const bhTile = state.board.tiles.find((t) => t.id === state.blackHoleTileId) ?? null
    const from =
      tr && bhTile
        ? (() => {
            const px = (bhTile.center.x - tr.centerX) * tr.scale + tr.width / 2 + tr.panX
            const py = (bhTile.center.y - tr.centerY) * tr.scale + tr.height / 2 + tr.panY
            return { x: tr.canvasRect.left + px, y: tr.canvasRect.top + py }
          })()
        : tr
          ? { x: tr.canvasRect.left + tr.width / 2, y: tr.canvasRect.top + tr.height / 2 }
          : null

    if (to && from) {
      const addFx = (resource: Resource, a: { x: number; y: number }, b: { x: number; y: number }) => {
        const ev = { id: Math.random().toString(16).slice(2), resource, fromX: a.x, fromY: a.y, toX: b.x, toY: b.y }
        setResourceFx((fx) => fx.concat(ev))
        window.setTimeout(() => setResourceFx((fx) => fx.filter((x) => x.id !== ev.id)), 950)
      }
      addFx(pending.receive, from, to)
      window.setTimeout(() => addFx(pending.give, to, from), 120)
    }

    setDealNotice({ text: 'Tausch erfolgreich', kind: 'ok' })
    window.setTimeout(() => {
      if (openMenuRef.current === 'market') setOpenMenu(null)
    }, 1000)
  }, [state?.blackHolePool, state?.players, state?.blackHoleTileId, state?.board?.tiles, meId])

  const turnEventText = useMemo(() => {
    if (!state) return ''
    const turnEvents = state.events.filter((e) => e.timestamp >= state.turnStartedAt)
    const primary = turnEvents[turnEvents.length - 1]?.text ?? ''
    const secondary = turnEvents[turnEvents.length - 2]?.text ?? ''
    return [primary, secondary].filter(Boolean).join(' · ')
  }, [state?.events, state?.turnStartedAt])

  const remainingTurnMs = state ? Math.max(0, (state.turnLimitMs ?? 45000) - (nowMs - state.turnStartedAt)) : 0
  const remainingSec = Math.ceil(remainingTurnMs / 1000)
  const prevRemainingSecRef = useRef(remainingSec)
  
  useEffect(() => {
    if (state && state.status === 'playing' && remainingSec <= 5 && remainingSec > 0 && remainingSec !== prevRemainingSecRef.current) {
      playToneRef.current(880, 50, 'square', 0.05)
    }
    prevRemainingSecRef.current = remainingSec
  }, [remainingSec, state?.status])

  useEffect(() => {
    const update = () => {
      const el = eventTextRef.current
      if (!el) return setEventMarquee(false)
      const parent = el.parentElement
      if (!parent) return setEventMarquee(false)
      setEventMarquee(el.scrollWidth > parent.clientWidth + 1)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [turnEventText])

  useEffect(() => {
    const update = () => {
      const rightDock = rightDockRef.current
      if (!rightDock) return setEventRightInset(220)
      const rect = rightDock.getBoundingClientRect()
      const inset = Math.max(80, Math.round(window.innerWidth - rect.left + 8))
      setEventRightInset(inset)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [lang, remainingSec, state?.round, state?.maxRounds, state?.status, state?.setup?.required])

  const me = state.players.find((p) => p.id === meId) ?? null
  const isSetup = state.status === 'setup_phase_1' || state.status === 'setup_phase_2'
  const required = isSetup ? (state.setup?.required ?? null) : null
  const setupLabel =
    state.status === 'setup_phase_1'
      ? `Setup 1: ${required === 'station' ? 'Station setzen' : required === 'hyperlane' ? 'Hyperlane setzen' : '—'}`
      : state.status === 'setup_phase_2'
        ? `Setup 2: ${required === 'station' ? 'Station setzen' : required === 'hyperlane' ? 'Hyperlane setzen' : '—'}`
        : null

  const canBuildStation = isMyTurn && state.phase === 'main' && (state.status === 'playing' || isSetup) && (!isSetup || required === 'station')
  const canBuildHyperlane = isMyTurn && state.phase === 'main' && (state.status === 'playing' || isSetup) && (!isSetup || required === 'hyperlane')
  const canUpgrade = isMyTurn && state.status === 'playing' && state.phase === 'main'
  const canRollNow = isMyTurn && state.status === 'playing' && state.phase === 'await_roll'
  const d1 = state.lastDiceRoll?.d1 ?? null
  const d2 = state.lastDiceRoll?.d2 ?? null
  const stationCost: Partial<Record<Resource, number>> = { metal: 1, gas: 1, food: 1, crystal: 1 }
  const hyperlaneCost: Partial<Record<Resource, number>> = { metal: 1, gas: 1 }
  const starbaseCost: Partial<Record<Resource, number>> = { data: 3, crystal: 2 }
  const warpLaneCost: Partial<Record<Resource, number>> = { metal: 2, gas: 2, crystal: 2, food: 2, data: 2 }
  const affordStation = canAfford(me?.resources, stationCost)
  const affordHyperlane = canAfford(me?.resources, hyperlaneCost)
  const affordStarbase = canAfford(me?.resources, starbaseCost)
  const affordWarpLane = canAfford(me?.resources, warpLaneCost)
  const setupCounts = isSetup ? (state.setup?.placementsByPlayerId[meId] ?? null) : null
  const setupLimit = state.status === 'setup_phase_1' ? 1 : 2
  const canBuildStationNow = isSetup
    ? canBuildStation && Boolean(setupCounts) && (setupCounts!.stationsPlaced < setupLimit)
    : canBuildStation && affordStation
  const canBuildHyperlaneNow = isSetup
    ? canBuildHyperlane && Boolean(setupCounts) && (setupCounts!.hyperlanesPlaced < setupLimit)
    : canBuildHyperlane && affordHyperlane
  const canUpgradeNow = canUpgrade && affordStarbase
  const canWarpNow = isMyTurn && state.status === 'playing' && state.phase === 'main' && affordWarpLane
  const resourceOrder: Resource[] = ['metal', 'gas', 'crystal', 'food', 'data']
  const resourceLabel = (r: Resource) =>
    r === 'metal' ? t.metal : r === 'gas' ? t.gas : r === 'crystal' ? t.crystal : r === 'food' ? t.food : t.data
  const computeBlackHoleRates = (pool: Record<Resource, number>) => {
    const available = resourceOrder
      .map((r) => ({ r, n: pool[r] ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || a.r.localeCompare(b.r))

    const result = new Map<Resource, number>()
    const n = available.length
    if (n === 0) return result
    if (n === 1) {
      result.set(available[0]!.r, 2)
      return result
    }
    if (n === 2) {
      result.set(available[0]!.r, 2)
      result.set(available[1]!.r, 4)
      return result
    }

    const topCount = Math.ceil(n / 3)
    const midCount = Math.ceil((n - topCount) / 2)
    for (let i = 0; i < n; i++) {
      const rate = i < topCount ? 2 : i < topCount + midCount ? 3 : 4
      result.set(available[i]!.r, rate)
    }
    return result
  }
  const blackHoleRates = computeBlackHoleRates(state.blackHolePool)
  const marketRate = blackHoleRates.get(marketReceive) ?? null
  const canMarket =
    isMyTurn &&
    state.status === 'playing' &&
    state.phase === 'main' &&
    marketGive !== marketReceive &&
    (state.blackHolePool[marketReceive] ?? 0) > 0 &&
    marketRate !== null &&
    (me?.resources[marketGive] ?? 0) >= marketRate
  const canBuildAnyNow = Boolean(canBuildStationNow || canBuildHyperlaneNow || canUpgradeNow || canWarpNow)
  const cornerSlots = ['lt', 'rt', 'rb', 'lb'] as const
  const corners = (() => {
    const players = state.players
    const idx = players.findIndex((p) => p.id === meId)
    if (idx < 0) return cornerSlots.map((_, i) => players[i] ?? null)
    const rotated = players.slice(idx).concat(players.slice(0, idx))
    const others = rotated.slice(1)
    const lt = others[0] ?? null
    const rt = others[1] ?? null
    const rb = others[2] ?? null
    const lb = null
    return [lt, rt, rb, lb]
  })()

  useEffect(() => {
    const rtId = corners[1]?.id ?? null
    const rbId = corners[2]?.id ?? null

    const update = () => {
      if (!rtId || !rbId) return
      const rtEl = cornerRefByPlayerId.current[rtId] ?? null
      const rbEl = cornerRefByPlayerId.current[rbId] ?? null
      if (!rtEl || !rbEl) return
      const rt = rtEl.getBoundingClientRect()
      const rb = rbEl.getBoundingClientRect()
      if (!Number.isFinite(rt.bottom) || !Number.isFinite(rb.top)) return
      const center = (rt.bottom + rb.top) / 2
      const clamped = Math.max(60, Math.min(window.innerHeight - 60, center))
      setActionDockTopPx(clamped)

      const groupEl = actionDockGroupRef.current
      if (!groupEl) return
      const gapH = rb.top - rt.bottom
      const originalTwoCol = groupEl.classList.contains('two-col')
      if (originalTwoCol) groupEl.classList.remove('two-col')
      const oneColRect = groupEl.getBoundingClientRect()
      if (originalTwoCol) groupEl.classList.add('two-col')

      const oneColH = oneColRect.height
      if (!Number.isFinite(oneColH) || !Number.isFinite(gapH)) return

      const pad = 12
      const hysteresisPx = 10
      setActionDockTwoCol((prev) => {
        if (prev) {
          return oneColH + pad > gapH - hysteresisPx
        }
        return oneColH + pad > gapH + hysteresisPx
      })
    }

    const raf = window.requestAnimationFrame(update)
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            update()
          })
    if (ro && actionDockGroupRef.current) ro.observe(actionDockGroupRef.current)
    window.addEventListener('resize', update)
    return () => {
      window.cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [corners[1]?.id, corners[2]?.id])
  const turnTimer = `${String(Math.floor(remainingSec / 60)).padStart(2, '0')}:${String(remainingSec % 60).padStart(2, '0')}`
  const showChat = openMenu === 'chat'
  const showLog = openMenu === 'log'
  const showBuild = openMenu === 'build'
  const showMarket = openMenu === 'market'
  const showRecipes = openMenu === 'recipes'

  const sumAmounts = (amounts: Partial<Record<Resource, number>>) =>
    (Object.values(amounts) as number[]).reduce((a, b) => a + (b ?? 0), 0)
  const canPay = (cost: Partial<Record<Resource, number>>) => {
    for (const [k, v] of Object.entries(cost) as Array<[Resource, number]>) {
      if ((me?.resources[k] ?? 0) < (v ?? 0)) return false
    }
    return true
  }
  const cleanAmounts = (amounts: Partial<Record<Resource, number>>) => {
    const out: Partial<Record<Resource, number>> = {}
    for (const r of resourceOrder) {
      const v = Math.floor(amounts[r] ?? 0)
      if (!Number.isFinite(v) || v <= 0) continue
      out[r] = v
    }
    return out
  }
  const renderAmounts = (amounts: Partial<Record<Resource, number>>) => {
    const entries = resourceOrder.map((r) => ({ r, n: Math.floor(amounts[r] ?? 0) })).filter((x) => x.n > 0)
    if (!entries.length) return <span className="subtle-text">—</span>
    return (
      <>
        {entries.map((x) => (
          <span key={x.r} className="star-trade-offer-pill">
            <img className="star-market-icon star-mini-hex" src={resourceIconSrc(x.r)} alt={x.r} />
            <span className="star-trade-offer-pill-label">{resourceLabel(x.r)}</span>
            <span className="star-trade-offer-pill-count">{x.n}</span>
          </span>
        ))}
      </>
    )
  }
  const standings = state.players
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  const statsByPlayerId = new Map<string, { stations: number; starbases: number; hyperlanes: number; warpLanes: number }>()
  for (const p of state.players) statsByPlayerId.set(p.id, { stations: 0, starbases: 0, hyperlanes: 0, warpLanes: 0 })
  for (const s of state.stations) {
    const st = statsByPlayerId.get(s.playerId)
    if (!st) continue
    if (s.level === 'starbase') st.starbases += 1
    else st.stations += 1
  }
  for (const h of state.hyperlanes) {
    const st = statsByPlayerId.get(h.playerId)
    if (st) st.hyperlanes += 1
  }
  for (const w of state.warpLanes) {
    const st = statsByPlayerId.get(w.playerId)
    if (st) st.warpLanes += 1
  }

  const activePlayer = state.players[state.currentPlayerIndex] ?? null
  const activeClr = activePlayer ? playerColor(activePlayer.color) : '#94a3b8'
  const showTurnBadge = state.status !== 'lobby' && state.status !== 'finished'

  return (
    <div className="page star-game">
      <div className="star-float-top-center" style={{ left: 0, right: eventRightInset, justifyContent: 'flex-start' }}>
        <div className="star-top-actions" aria-label="Schnellzugriff">
          <div className="star-zoom compact">
            <span className="star-zoom-label" aria-label="Zoom">
              <span className="material-symbols-rounded" aria-hidden="true">zoom_in</span>
            </span>
            <input
              className="star-zoom-slider"
              type="range"
              min={0}
              max={2}
              step={1}
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value) as 0 | 1 | 2)}
            />
          </div>
          <button
            type="button"
            className={`star-btn icon-only ${openMenu === 'log' ? 'active' : ''}`}
            aria-label={t.log}
            title={t.log}
            onClick={() => setOpenMenu((m) => (m === 'log' ? null : 'log'))}
          >
            <span className="material-symbols-rounded" aria-hidden="true">list_alt</span>
          </button>
          <button
            type="button"
            className="star-btn icon-only"
            aria-label={isMuted ? t.soundOn : t.soundOff}
            title={isMuted ? t.soundOn : t.soundOff}
            onClick={() => setIsMuted((v) => !v)}
          >
            {isMuted ? (
              <span className="material-symbols-rounded" aria-hidden="true">volume_off</span>
            ) : (
              <span className="material-symbols-rounded" aria-hidden="true">volume_up</span>
            )}
          </button>
        </div>
        {turnEventText ? (
          <div className={`star-event-bar ${eventMarquee ? 'marquee' : ''}`} aria-label={t.events}>
            <div className="star-event-text" ref={eventTextRef}>
              {turnEventText}
            </div>
          </div>
        ) : null}
      </div>
      <div className="star-float-top-right" ref={rightDockRef}>
        <div className="star-meta-pill">{t.round} {state.round}/{state.maxRounds}</div>
        {setupLabel ? <div className="star-meta-pill">{setupLabel}</div> : null}
        <button type="button" className="star-btn icon-only" aria-label="Sprache" onClick={() => {
          setLang((l) => {
            const n = l === 'de' ? 'en' : 'de'
            window.localStorage.setItem('star_lang', n)
            return n
          })
        }}>
          <span className="material-symbols-rounded" aria-hidden="true">translate</span>
        </button>
        {state.status !== 'lobby' ? (
          <div className={`star-meta-pill ${remainingSec <= 5 ? 'star-pulse-red' : ''}`}>{t.time} {turnTimer}</div>
        ) : null}
      </div>
      <button
        type="button"
        className="star-float-exit"
        aria-label={t.leaveGame}
        title={t.leaveGame}
        onClick={() => {
          if (!window.confirm(t.leaveGameConfirm)) return
          navigate('/lobby')
        }}
      >
        <span className="material-symbols-rounded" aria-hidden="true">close</span>
      </button>

      {lastError ? (
        <div className="star-float-error" role="alert">
          <div>{lastError}</div>
          <details style={{ marginTop: 6 }}>
            <summary>Debug</summary>
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, whiteSpace: 'pre-wrap', opacity: 0.95, marginTop: 6 }}>
              {JSON.stringify(
                {
                  url: window.location.href,
                  connected: isConnected,
                  socketId: socket?.id ?? null,
                  gameId: state.id,
                  meId,
                  status: state.status,
                  phase: state.phase,
                  currentPlayerId: state.players[state.currentPlayerIndex]?.id ?? null,
                  openMenu,
                  mode,
                },
                null,
                2,
              )}
            </div>
          </details>
        </div>
      ) : null}

      {showTurnBadge ? (
        <div className="star-turn-badge" style={{ top: topUiInset + 10, ['--pclr']: activeClr } as CSSProperties & { ['--pclr']: string }}>
          <span className="material-symbols-rounded" aria-hidden="true">play_circle</span>
          <span className="star-turn-label">{t.turnNow}:</span>
          <span className="star-turn-name">{activePlayer?.name ?? '—'}</span>
        </div>
      ) : null}

      <div className="star-main sidebar-hidden">
        <div
          className="star-canvas-wrap"
          ref={canvasWrapRef}
          onContextMenu={(e) => {
            if (mode === 'none') return
            e.preventDefault()
            setMode('none')
            setPendingVertex(null)
            setPendingWarpFrom(null)
          }}
          onMouseDown={(e) => {
            if (dragRef.current) return
            if (e.button !== 0) return
            isPanningRef.current = true
            movedRef.current = false
            panStartRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
          }}
          onMouseMove={(e) => {
            if (isPanningRef.current) {
              const dx = e.clientX - panStartRef.current.x
              const dy = e.clientY - panStartRef.current.y
              if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
              setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy })
              return
            }
            if (mode !== 'none') setCursorBuildPos({ x: e.clientX, y: e.clientY })
            const p = clientToBoard(e.clientX, e.clientY)
            if (!p) {
              setHoverVertexId(null)
              setHoverEdgeId(null)
              setHoverTileTip(null)
              return
            }
            const scale = transformRef.current?.scale ?? 1
            const hit = hitTestVertex(state.board.vertices, p.bx, p.by, 16 / scale)
            setHoverVertexId(hit ?? null)

            if (mode === 'hyperlane' && isMyTurn && state.phase === 'main') {
              const edgeHit = hitTestEdge(state.board.edges, vById, p.bx, p.by, 28 / scale)
              if (edgeHit) {
                const edge = state.board.edges.find((x) => x.id === edgeHit) ?? null
                setHoverEdgeId(edge && canBuildHyperlaneEdge(state, meId, edge) ? edgeHit : null)
              } else {
                setHoverEdgeId(null)
              }
            } else {
              setHoverEdgeId(null)
            }
            if (dragRef.current) {
              setHoverTileTip(null)
              return
            }
            if (hit) {
              const st = state.stations.find((s) => s.vertexId === hit)
              if (st) {
                const gainPerHit = st.level === 'starbase' ? 2 : 1
                const adjacentTiles = state.board.tiles.filter((t) => t.cornerVertexIds.includes(hit) && t.biome !== 'singularity')
                const lines: string[] = []
                lines.push(`${st.level === 'starbase' ? tMap[lang].starbase : tMap[lang].station}: ${state.players.find((p) => p.id === st.playerId)?.name ?? '—'}`)
                if (adjacentTiles.length) {
                  lines.push('Wenn gewürfelt wird:')
                  for (const tile of adjacentTiles) {
                    const res = tileResource(tile.biome)
                    if (!res || !tile.numberToken) continue
                    const blocked = tile.id === state.blackHoleTileId
                    const amt = blocked ? 0 : gainPerHit
                    const rn =
                      res === 'gas'
                        ? t.gas
                        : res === 'metal'
                          ? t.metal
                          : res === 'crystal'
                            ? t.crystal
                            : res === 'food'
                              ? t.food
                              : t.data
                    lines.push(`${tile.numberToken}: ${rn} +${amt}`)
                  }
                }
                return setHoverTileTip({ x: e.clientX, y: e.clientY, text: lines.join('\n') })
              }
            }

            const tile = findTileAtPoint(state, p.bx, p.by, vById)
            if (!tile || tile.biome === 'singularity') return setHoverTileTip(null)
            const res = tileResource(tile.biome)
            if (!res) return setHoverTileTip(null)
            const rn =
              res === 'gas'
                ? t.gas
                : res === 'metal'
                  ? t.metal
                  : res === 'crystal'
                    ? t.crystal
                    : res === 'food'
                      ? t.food
                      : t.data
            const stations = state.stations.filter((s) => tile.cornerVertexIds.includes(s.vertexId))
            const lines: string[] = []
            lines.push(`${rn}${tile.numberToken ? ` · ${tile.numberToken}` : ''}`)
            if (tile.id === state.blackHoleTileId) {
              lines.push(`${t.blackhole}: blockiert`)
              return setHoverTileTip({ x: e.clientX, y: e.clientY, text: lines.join('\n') })
            }
            if (stations.length === 0) {
              lines.push('Erhält: —')
              return setHoverTileTip({ x: e.clientX, y: e.clientY, text: lines.join('\n') })
            }
            const byPlayer = new Map<string, number>()
            for (const s of stations) {
              const amt = s.level === 'starbase' ? 2 : 1
              byPlayer.set(s.playerId, (byPlayer.get(s.playerId) ?? 0) + amt)
            }
            const rec = Array.from(byPlayer.entries())
              .map(([pid, amt]) => `${state.players.find((p) => p.id === pid)?.name ?? '—'} x${amt}`)
              .join(', ')
            lines.push(`Erhält: ${rec}`)
            setHoverTileTip({ x: e.clientX, y: e.clientY, text: lines.join('\n') })
          }}
          onMouseUp={() => {
            if (!isPanningRef.current) return
            isPanningRef.current = false
            if (movedRef.current) skipClickRef.current = true
          }}
          onMouseLeave={() => {
            if (isPanningRef.current) {
              isPanningRef.current = false
              if (movedRef.current) skipClickRef.current = true
            }
            setHoverVertexId(null)
            setHoverTileTip(null)
            setCursorBuildPos(null)
          }}
          onClick={(e) => {
            if (dragRef.current) return
            if (skipClickRef.current) {
              skipClickRef.current = false
              return
            }
            const canvas = canvasRef.current
            if (!canvas) return
            const rect = canvas.getBoundingClientRect()
            const px = e.clientX - rect.left
            const py = e.clientY - rect.top

            const bounds = computeBounds(state.board.vertices)
            const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
            const pad = 40
            const dx = Math.max(1, bounds.maxX - bounds.minX)
            const dy = Math.max(1, bounds.maxY - bounds.minY)
            const fitScale = Math.min((rect.width - pad * 2) / dx, (rect.height - pad * 2) / dy)
            const zoomFactors = [1.0, 1.35, 1.8] as const
            const scale = fitScale * zoomFactors[zoomLevel]
            const bx = (px - rect.width / 2 - pan.x) / scale + center.x
            const by = (py - rect.height / 2 - pan.y) / scale + center.y

            const selHit = hitTestVertex(state.board.vertices, bx, by, 18 / scale)
            if (selHit) {
              const st = state.stations.find((s) => s.vertexId === selHit)
              if (st && mode === 'none') {
                setSelectedPlayerId((cur) => (cur === st.playerId ? null : st.playerId))
                return
              }
            }
            if (selectedPlayerId && mode === 'none') setSelectedPlayerId(null)

            if (!isMyTurn) return

            if (state.phase === 'wormhole') {
              if (mode === 'blackhole') {
                const t = findTileAtPoint(state, bx, by, vById)
                if (t && t.biome !== 'singularity') {
                  resolveWormhole({ newBlackHoleTileId: t.id })
                  setMode('none')
                  setCursorBuildPos(null)
                }
                return
              }
              const t = findTileAtPoint(state, bx, by, vById)
              if (t && t.id === state.blackHoleTileId) {
                setMode('blackhole')
                setCursorBuildPos({ x: e.clientX, y: e.clientY })
              }
              return
            }

            if (mode === 'hyperlane') {
              if (isSetup && required !== 'hyperlane') return
              const edgeHit = hitTestEdge(state.board.edges, vById, bx, by, 30 / scale)
              if (!edgeHit) {
                setMode('none')
                setPendingVertex(null)
                setPendingWarpFrom(null)
                setHoverEdgeId(null)
                return
              }
              const edge = state.board.edges.find((x) => x.id === edgeHit) ?? null
              if (!edge || !canBuildHyperlaneEdge(state, meId, edge)) return
              buildHyperlane(edge.id)
              emitHoloPulseEdge(edge.id)
              playToneRef.current(196, 70, 'sawtooth', 0.05)
              setMode('none')
              setHoverEdgeId(null)
              return
            }

            const hit = hitTestVertex(state.board.vertices, bx, by, 18 / scale)
            if (!hit) {
              if (mode !== 'none') {
                setMode('none')
                setPendingVertex(null)
                setPendingWarpFrom(null)
              }
              return
            }

            if (mode === 'warp') {
              if (state.status !== 'playing' || state.phase !== 'main') return
              const axialDistance = (q: number, r: number) => {
                const x = q
                const z = r
                const y = -x - z
                return (Math.abs(x) + Math.abs(y) + Math.abs(z)) / 2
              }
              const boundary = new Set<string>()
              for (const t of state.board.tiles) {
                if (axialDistance(t.q, t.r) === state.board.radius) {
                  for (const vid of t.cornerVertexIds) boundary.add(vid)
                }
              }
              if (!boundary.has(hit)) return

              const hasMyStation = state.stations.some((s) => s.playerId === meId && s.vertexId === hit)
              if (!pendingWarpFrom) {
                if (!hasMyStation) return
                setPendingWarpFrom(hit)
                return
              }

              const from = pendingWarpFrom
              setPendingWarpFrom(null)
              buildWarpLane({ fromVertexId: from, toVertexId: hit })
              emitHoloPulseVertex(from)
              emitHoloPulseVertex(hit)
              setMode('none')
              return
            }

            if (mode === 'station') {
              if (isSetup && required !== 'station') return
              buildStation(hit)
              emitHoloPulseVertex(hit)
              setMode('none')
              return
            }
            if (mode === 'upgrade') {
              if (isSetup) return
              upgradeStarbase(hit)
              emitHoloPulseVertex(hit)
              setMode('none')
              return
            }
            if (mode === 'blackhole') {
              setMode('none')
              setCursorBuildPos(null)
              return
            }
          }}
        >
          <canvas ref={canvasRef} />
          <video
            ref={bhVidRef}
            src="/avatars/black_hole.webm"
            loop
            autoPlay
            muted
            playsInline
            className="star-blackhole-video"
            style={{
              position: 'absolute',
              display: 'none',
              pointerEvents: 'none',
              objectFit: 'contain',
              zIndex: 3
            }}
          />
          {state.status === 'finished' ? (
            <div className={`star-finish-overlay ${finishDone ? 'done' : ''}`} aria-hidden="true">
              <video
                ref={finishVidRef}
                src="/avatars/Finish_Sequence.mp4"
                autoPlay
                muted
                playsInline
                disablePictureInPicture
                className="star-finish-video"
                onEnded={(e) => {
                  const v = e.currentTarget
                  v.pause()
                  try {
                    v.currentTime = Math.max(0, v.duration - 0.04)
                  } catch {
                    void 0
                  }
                  setFinishDone(true)
                }}
              />
            </div>
          ) : null}
          {mode !== 'none' && cursorBuildPos ? (
            <div className="star-drag-ghost" style={{ left: cursorBuildPos.x, top: cursorBuildPos.y, color: playerColor(me?.color ?? 'blue') }}>
              {buildIcon(mode === 'station' ? 'station' : mode === 'upgrade' ? 'upgrade' : mode === 'hyperlane' ? 'hyperlane' : mode === 'warp' ? 'warp' : 'blackhole', me?.color)}
            </div>
          ) : null}
          {drag ? (
            <div className={`star-drag-ghost ${dragShake ? 'shake' : ''}`} style={{ left: drag.x, top: drag.y, color: playerColor(me?.color ?? 'blue') }}>
              {buildIcon(drag.kind, me?.color)}
            </div>
          ) : null}
          {hoverTileTip ? (
            <div className="star-tile-tooltip" style={{ left: hoverTileTip.x, top: hoverTileTip.y }}>
              {hoverTileTip.text}
            </div>
          ) : null}
          {eventToast && nowMs < eventToast.untilMs ? (
            <div className="star-event-toast" role="status">
              {eventToast.text}
            </div>
          ) : null}
          {showBuild ? (
            <div
              className="star-overlay-panel star-overlay-recipes"
              style={{
                left: '50%',
                top: topUiInset + 10,
                bottom: bottombarH + 10,
                transform: 'translateX(-50%)',
                width: 'min(560px, 94vw)',
              }}
            >
              <div className="star-panel star-market-panel">
                <div className="star-panel-title">
                  <div className="star-panel-title-row">
                    <span>{t.build}</span>
                    <button
                      type="button"
                      className="star-btn"
                      onClick={() => setVisualStyleBoth(visualStyle === 'holo' ? 'classic' : 'holo')}
                    >
                      {visualStyle === 'holo' ? 'Look: Holo' : 'Look: Klassisch'}
                    </button>
                    <button type="button" className="star-btn" onClick={() => setOpenMenu(null)}>
                      {t.close}
                    </button>
                  </div>
                </div>
                <div className="star-recipes">
                  {([
                    { kind: 'station' as const, label: t.station, enabled: canBuildStationNow, cost: stationCost },
                    { kind: 'hyperlane' as const, label: t.hyperlane, enabled: canBuildHyperlaneNow, cost: hyperlaneCost },
                    { kind: 'upgrade' as const, label: t.starbase, enabled: canUpgradeNow, cost: starbaseCost },
                    { kind: 'warp' as const, label: t.warp, enabled: canWarpNow, cost: warpLaneCost },
                  ]).map((opt) => (
                    <button
                      key={opt.kind}
                      type="button"
                      className="star-recipe-row"
                      disabled={!opt.enabled}
                      onClick={() => {
                        if (!opt.enabled) return
                        setPendingVertex(null)
                        setPendingWarpFrom(null)
                        setHoverEdgeId(null)
                        setMode(opt.kind === 'station' ? 'station' : opt.kind === 'upgrade' ? 'upgrade' : opt.kind === 'hyperlane' ? 'hyperlane' : 'warp')
                        setOpenMenu(null)
                        setEventToast({ text: opt.kind === 'hyperlane' ? t.hyperlaneEdgeHint : `${opt.label} · ${t.dragCancel}`, untilMs: nowMs + 1600 })
                      }}
                    >
                      <div className="star-recipe-icon" style={{ color: playerColor(me?.color ?? 'blue') }}>
                        {buildIcon(opt.kind, me?.color)}
                      </div>
                      <div className="star-recipe-line">
                        <span className="star-recipe-name">{opt.label}</span>
                        <span className="star-recipe-cost">{isSetup ? null : <CostInline cost={opt.cost} resources={me?.resources} />}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {showMarket ? (
            <div
              className="star-overlay-panel star-overlay-market"
              role="dialog"
              aria-label="Schwarzmarkt"
              style={{
                top: topUiInset + 10,
                bottom: 10,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseMove={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="star-panel star-market-panel">
                <div className="star-panel-title">
                  <div className="star-panel-title-row">
                    <span>{t.market}</span>
                    <button
                      type="button"
                      className="star-btn"
                      onClick={() => setVisualStyleBoth(visualStyle === 'holo' ? 'classic' : 'holo')}
                    >
                      {visualStyle === 'holo' ? 'Look: Holo' : 'Look: Klassisch'}
                    </button>
                    <button type="button" className="star-btn" onClick={() => setOpenMenu(null)}>
                      {t.close}
                    </button>
                  </div>
                </div>
                <div className="star-market-tabs">
                  <button
                    type="button"
                    className={`star-btn ${marketTab === 'hole' ? 'active' : ''}`}
                    onClick={() => {
                      setDealNotice(null)
                      setMarketTab('hole')
                    }}
                  >
                    {t.blackhole}
                  </button>
                  <button
                    type="button"
                    className={`star-btn ${marketTab === 'players' ? 'active' : ''}`}
                    onClick={() => {
                      setDealNotice(null)
                      setMarketTab('players')
                    }}
                  >
                    Schmugglerbörse
                  </button>
                  {(() => {
                    const currentTurnPlayerId = state.players[state.currentPlayerIndex]?.id ?? null
                    if (!currentTurnPlayerId) return null
                    const openOffer =
                      state.tradeOffers
                        .slice()
                        .reverse()
                        .find((o) => o.status === 'open' && o.fromPlayerId === currentTurnPlayerId) ?? null
                    if (!openOffer) return null
                    const secs = Math.max(0, Math.ceil((openOffer.createdAt + 20_000 - nowMs) / 1000))
                    return (
                      <div className="star-market-trade-countdown" aria-label="Countdown">
                        {secs}s
                      </div>
                    )
                  })()}
                </div>
                <div className="star-market-body">
                  {marketTab === 'hole' ? (
                    <div className="star-market-scroll">
                      <div>
                        <div className="star-market-section-title">Du gibst</div>
                        <div className="star-market-grid" style={{ marginTop: 8 }}>
                          {resourceOrder.map((r) => (
                            <button
                              key={r}
                              type="button"
                              className={`star-market-chip ${marketGive === r ? 'selected' : ''}`}
                              onClick={() => setMarketGive(r)}
                              disabled={(me?.resources[r] ?? 0) <= 0}
                            >
                              <div className="star-market-chip-top">
                                <img className="star-market-icon star-mini-hex" src={resourceIconSrc(r)} alt={r} />
                                <span>{resourceLabel(r)}</span>
                              </div>
                              <div className="star-market-chip-sub">Du hast: {me?.resources[r] ?? 0}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="star-market-section-title">Du bekommst (aus dem Loch)</div>
                        <div className="star-market-grid" style={{ marginTop: 8 }}>
                          {resourceOrder.map((r) => {
                            const available = (state.blackHolePool[r] ?? 0) > 0
                            const rate = available ? (blackHoleRates.get(r) ?? 4) : null
                            return (
                              <button
                                key={r}
                                type="button"
                                className={`star-market-chip ${marketReceive === r ? 'selected' : ''}`}
                                onClick={() => setMarketReceive(r)}
                                disabled={!available}
                              >
                                <div className="star-market-chip-top">
                                  <img className="star-market-icon star-mini-hex" src={resourceIconSrc(r)} alt={r} />
                                  <span>{resourceLabel(r)}</span>
                                </div>
                                <div className="star-market-chip-sub">
                                  Im Loch: {state.blackHolePool[r] ?? 0}
                                  {rate ? ` · Kurs ${rate}:1` : ''}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="star-trade-offer">
                        <div className="star-trade-offer-title">
                          <span>Deal</span>
                          {dealNotice ? (
                            <span className={`star-trade-offer-note ${dealNotice.kind}`}>{dealNotice.text}</span>
                          ) : (
                            <span style={{ opacity: 0.75 }}>{marketRate ? `${marketRate}:1` : '—'}</span>
                          )}
                        </div>
                        <div className="star-trade-offer-amounts">
                          <span className="star-trade-offer-pill">
                            <img className="star-market-icon star-mini-hex" src={resourceIconSrc(marketGive)} alt={marketGive} />
                            <span className="star-trade-offer-pill-label">{resourceLabel(marketGive)}</span>
                            <span className="star-trade-offer-pill-count">{marketRate ?? '—'}</span>
                          </span>
                          <span style={{ opacity: 0.65, alignSelf: 'center' }} aria-hidden="true">
                            <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                          </span>
                          <span className="star-trade-offer-pill">
                            <img className="star-market-icon star-mini-hex" src={resourceIconSrc(marketReceive)} alt={marketReceive} />
                            <span className="star-trade-offer-pill-label">{resourceLabel(marketReceive)}</span>
                            <span className="star-trade-offer-pill-count">1</span>
                          </span>
                        </div>
                        <div className="star-trade-offer-actions">
                          <button
                            type="button"
                            className="star-btn"
                            disabled={!canMarket}
                            onClick={() => {
                              setDealNotice(null)
                              const rate = marketRate ?? null
                              if (!rate) return
                              const meLocal = state.players.find((p) => p.id === meId) ?? null
                              if (!meLocal) return
                              pendingBlackHoleTradeRef.current = {
                                token: Math.random().toString(16).slice(2),
                                give: marketGive,
                                receive: marketReceive,
                                rate,
                                startedAtMs: Date.now(),
                                before: {
                                  giveHave: meLocal.resources[marketGive] ?? 0,
                                  receiveHave: meLocal.resources[marketReceive] ?? 0,
                                  poolGive: state.blackHolePool[marketGive] ?? 0,
                                  poolReceive: state.blackHolePool[marketReceive] ?? 0,
                                },
                              }
                              tradeBlackMarket({ give: marketGive, receive: marketReceive })
                            }}
                          >
                            Tauschen
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="star-market-scroll">
                      {(() => {
                        const currentTurnPlayerId = state.players[state.currentPlayerIndex]?.id ?? null
                        const openOffer =
                          currentTurnPlayerId
                            ? state.tradeOffers
                                .slice()
                                .reverse()
                                .find((o) => o.status === 'open' && o.fromPlayerId === currentTurnPlayerId) ?? null
                            : null

                        const giveAmounts = isMyTurn ? (openOffer ? openOffer.give : offerGive) : openOffer?.want ?? {}
                        const wantAmounts = isMyTurn ? (openOffer ? openOffer.want : offerWant) : openOffer?.give ?? {}

                        const incGive = (r: Resource) => {
                          const have = me?.resources[r] ?? 0
                          setOfferGive((prev) => {
                            const cur = Math.max(0, Math.floor(prev[r] ?? 0))
                            if (cur >= have) return prev
                            return { ...prev, [r]: cur + 1 }
                          })
                        }

                        const incWant = (r: Resource) => {
                          setOfferWant((prev) => {
                            const cur = Math.max(0, Math.floor(prev[r] ?? 0))
                            if (cur >= 20) return prev
                            return { ...prev, [r]: cur + 1 }
                          })
                        }

                        const decGive = (r: Resource) => {
                          setOfferGive((prev) => {
                            const cur = Math.max(0, Math.floor(prev[r] ?? 0))
                            if (cur <= 0) return prev
                            const next = { ...prev }
                            const n = cur - 1
                            if (n <= 0) delete next[r]
                            else next[r] = n
                            return next
                          })
                        }

                        const decWant = (r: Resource) => {
                          setOfferWant((prev) => {
                            const cur = Math.max(0, Math.floor(prev[r] ?? 0))
                            if (cur <= 0) return prev
                            const next = { ...prev }
                            const n = cur - 1
                            if (n <= 0) delete next[r]
                            else next[r] = n
                            return next
                          })
                        }

                        const canSendNow =
                          state.status === 'playing' &&
                          state.phase === 'main' &&
                          isMyTurn &&
                          sumAmounts(cleanAmounts(offerGive)) > 0 &&
                          sumAmounts(cleanAmounts(offerWant)) > 0 &&
                          canPay(cleanAmounts(offerGive)) &&
                          !openOffer

                        const canAcceptNow =
                          Boolean(openOffer) &&
                          state.status === 'playing' &&
                          state.phase === 'main' &&
                          !isMyTurn &&
                          canPay(openOffer!.want)
                        const canDeclineNow = Boolean(openOffer) && state.status === 'playing' && state.phase === 'main' && !isMyTurn

                        const renderAmountsEditable = (amounts: Partial<Record<Resource, number>>, onDec: (r: Resource) => void) => {
                          const entries = resourceOrder.map((r) => ({ r, n: Math.floor(amounts[r] ?? 0) })).filter((x) => x.n > 0)
                          if (!entries.length) return <span className="subtle-text">—</span>
                          return (
                            <>
                              {entries.map((x) => (
                                <button key={x.r} type="button" className="star-trade-offer-pill star-trade-offer-pill-btn" onClick={() => onDec(x.r)}>
                                  <img className="star-market-icon star-mini-hex" src={resourceIconSrc(x.r)} alt={x.r} />
                                  <span className="star-trade-offer-pill-label">{resourceLabel(x.r)}</span>
                                  <span className="star-trade-offer-pill-count">{x.n}</span>
                                </button>
                              ))}
                            </>
                          )
                        }

                        return (
                          <>
                            <div>
                              <div className="star-market-section-title">Du gibst</div>
                              <div className="star-market-grid" style={{ marginTop: 8 }}>
                                {resourceOrder.map((r) => {
                                  const have = me?.resources[r] ?? 0
                                  const selected = Math.max(0, Math.floor(giveAmounts[r] ?? 0))
                                  const lockedByWant = Math.max(0, Math.floor(wantAmounts[r] ?? 0)) > 0
                                  const disabled = !isMyTurn || Boolean(openOffer) || have <= 0 || lockedByWant
                                  return (
                                    <button
                                      key={r}
                                      type="button"
                                      className={`star-market-chip ${selected > 0 ? 'selected' : ''}`}
                                      onClick={() => incGive(r)}
                                      disabled={disabled}
                                    >
                                      <div className="star-market-chip-top">
                                        <img className="star-market-icon star-mini-hex" src={resourceIconSrc(r)} alt={r} />
                                        <span>{resourceLabel(r)}</span>
                                      </div>
                                      <div className="star-market-chip-sub">
                                        Du hast: {have}
                                        {selected > 0 ? ` · ${selected}` : ''}
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            <div>
                              <div className="star-market-section-title">Du bekommst</div>
                              <div className="star-market-grid" style={{ marginTop: 8 }}>
                                {resourceOrder.map((r) => {
                                  const selected = Math.max(0, Math.floor(wantAmounts[r] ?? 0))
                                  const lockedByGive = Math.max(0, Math.floor(giveAmounts[r] ?? 0)) > 0
                                  const disabled = !isMyTurn || Boolean(openOffer) || lockedByGive
                                  return (
                                    <button
                                      key={r}
                                      type="button"
                                      className={`star-market-chip ${selected > 0 ? 'selected' : ''}`}
                                      onClick={() => incWant(r)}
                                      disabled={disabled}
                                    >
                                      <div className="star-market-chip-top">
                                        <img className="star-market-icon star-mini-hex" src={resourceIconSrc(r)} alt={r} />
                                        <span>{resourceLabel(r)}</span>
                                      </div>
                                      <div className="star-market-chip-sub">{selected > 0 ? `Auswahl: ${selected}` : 'Klick zum hinzufügen'}</div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            <div className="star-trade-offer">
                              <div className="star-trade-offer-title">
                                <span>Deal</span>
                                {dealNotice ? <span className={`star-trade-offer-note ${dealNotice.kind}`}>{dealNotice.text}</span> : <span />}
                              </div>
                              <div className="star-trade-offer-amounts">
                                {isMyTurn
                                  ? openOffer
                                    ? renderAmounts(openOffer.give)
                                    : renderAmountsEditable(cleanAmounts(offerGive), decGive)
                                  : openOffer
                                    ? renderAmounts(openOffer.want)
                                    : <span className="subtle-text">—</span>}
                                <span style={{ opacity: 0.65, alignSelf: 'center' }} aria-hidden="true">
                                  <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                                </span>
                                {isMyTurn
                                  ? openOffer
                                    ? renderAmounts(openOffer.want)
                                    : renderAmountsEditable(cleanAmounts(offerWant), decWant)
                                  : openOffer
                                    ? renderAmounts(openOffer.give)
                                    : <span className="subtle-text">—</span>}
                              </div>
                              <div className="star-trade-offer-actions">
                                {isMyTurn ? (
                                  <button
                                    type="button"
                                    className="star-btn"
                                    disabled={!canSendNow}
                                    onClick={() => {
                                      setDealNotice(null)
                                      const give = cleanAmounts(offerGive)
                                      const want = cleanAmounts(offerWant)
                                      pendingTradeOfferCreateRef.current = { token: Math.random().toString(16).slice(2), startedAtMs: Date.now() }
                                      createTradeOffer({ toPlayerId: null, give, want })
                                    }}
                                  >
                                    Angebot senden
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="star-btn"
                                      disabled={!canAcceptNow}
                                      onClick={() => {
                                        if (!openOffer) return
                                        setDealNotice(null)
                                        pendingTradeAcceptRef.current = openOffer.id
                                        acceptTradeOffer({ offerId: openOffer.id })
                                      }}
                                    >
                                      Annehmen
                                    </button>
                                    <button
                                      type="button"
                                      className="star-btn"
                                      disabled={!canDeclineNow}
                                      onClick={() => {
                                        if (!openOffer) return
                                        setDealNotice(null)
                                        if (openOffer.toPlayerId && openOffer.toPlayerId === meId) {
                                          declineTradeOffer({ offerId: openOffer.id })
                                        }
                                        setOpenMenu(null)
                                      }}
                                    >
                                      Ablehnen
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {showLog ? (
            <div
              className="star-overlay-panel star-overlay-recipes"
              style={{
                left: '50%',
                top: topUiInset + 10,
                bottom: bottombarH + 10,
                transform: 'translateX(-50%)',
                width: 'min(560px, 94vw)',
              }}
            >
              <div className="star-panel star-market-panel">
                <div className="star-panel-title">
                  <div className="star-panel-title-row">
                    <span>Log</span>
                    <button
                      type="button"
                      className="star-btn"
                      onClick={() => setVisualStyleBoth(visualStyle === 'holo' ? 'classic' : 'holo')}
                    >
                      {visualStyle === 'holo' ? 'Look: Holo' : 'Look: Klassisch'}
                    </button>
                    <button type="button" className="star-btn" onClick={() => setOpenMenu(null)}>
                      {t.close}
                    </button>
                  </div>
                </div>
                <div className="star-log">
                  {state.events.slice().reverse().map((ev) => (
                    <div key={ev.id} className="star-log-line">
                      <span className="star-log-ts">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                      <span className="star-log-text">{ev.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {showChat ? (
            <div
              className="star-overlay-panel star-overlay-recipes"
              style={{
                left: '50%',
                top: topUiInset + 10,
                bottom: bottombarH + 10,
                transform: 'translateX(-50%)',
                width: 'min(560px, 94vw)',
              }}
            >
              <div className="star-panel star-market-panel">
                <div className="star-panel-title">
                  <div className="star-panel-title-row">
                    <span>Chat</span>
                    <button type="button" className="star-btn" onClick={() => setOpenMenu(null)}>
                      {t.close}
                    </button>
                  </div>
                </div>
                <Chat state={state} embedded />
              </div>
            </div>
          ) : null}
          {showRecipes ? (
            <div
              className="star-overlay-panel star-overlay-recipes"
              style={{
                left: '50%',
                top: topUiInset + 10,
                bottom: bottombarH + 10,
                transform: 'translateX(-50%)',
                width: 'min(560px, 94vw)',
              }}
            >
              <div className="star-panel star-market-panel star-recipes-panel">
                <div className="star-panel-title">{t.recipes}</div>
                <div className="star-recipes">
                  {[
                    { kind: 'station' as const, title: t.station, cost: stationCost, note: isSetup ? t.setupFree : null },
                    { kind: 'hyperlane' as const, title: t.hyperlane, cost: hyperlaneCost, note: isSetup ? t.setupFree : null },
                    { kind: 'upgrade' as const, title: t.starbase, cost: starbaseCost, note: null },
                    { kind: 'warp' as const, title: t.warp, cost: warpLaneCost, note: null },
                  ].map((r) => (
                    <div key={r.kind} className="star-recipe-row">
                      <div className="star-recipe-icon" style={{ color: playerColor(me?.color ?? 'blue') }}>
                        {buildIcon(r.kind, me?.color)}
                      </div>
                      <div className="star-recipe-line">
                        <span className="star-recipe-name">{r.title}</span>
                        {r.note ? <span className="star-recipe-note">{r.note}</span> : null}
                        <span className="star-recipe-cost">
                          <CostStaticInline cost={r.cost} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {state.status === 'finished' ? (
            <div className={`star-gameover-overlay ${finishDone ? 'show' : ''}`} role="dialog" aria-label="Spiel beendet">
              <div className="star-gameover-card">
                <div className="star-gameover-title">Spiel beendet</div>
                <div className="star-gameover-sub">Gewinner: {standings[0]?.name ?? '—'}</div>
                <div className="star-podium">
                  {standings.map((p, idx) => {
                    const st = statsByPlayerId.get(p.id)
                    return (
                      <div key={p.id} className={`star-podium-slot place-${idx + 1}`}>
                        <div className="star-podium-rank">#{idx + 1}</div>
                        <div className="star-podium-name">{p.name}</div>
                        <div className="star-podium-metrics">
                          <div>Punkte: {p.score}</div>
                          <div>Stationen: {st?.stations ?? 0}</div>
                          <div>Sternbasen: {st?.starbases ?? 0}</div>
                          <div>Hyperlanes: {st?.hyperlanes ?? 0}</div>
                          <div>Warp-Lanes: {st?.warpLanes ?? 0}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    type="button"
                    className="star-btn"
                    onClick={() => {
                      if (!window.confirm(t.leaveGameConfirm)) return
                      navigate('/lobby')
                    }}
                  >
                    Spiel beenden
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="star-float-bottom" ref={bottombarRef}>
        <div className="star-float-bottom-left">
          <div className="star-home-stack">
            <div
              className="star-home-dock"
              style={{ ['--pclr']: playerColor(me?.color ?? 'blue') } as CSSProperties & { ['--pclr']: string }}
            >
              <div className="star-home-resbar" aria-label="Deine Rohstoffe">
                {(['metal', 'gas', 'crystal', 'food', 'data'] as const).map((r) => {
                  const count = me?.resources[r] ?? 0
                  const visibleCount = Math.min(5, Math.floor(count))
                  const extraCount = Math.max(0, Math.floor(count) - visibleCount)
                  const src = resourceIconSrc(r)
                  return (
                    <div key={r} className="star-home-rescol" aria-label={`${resourceLabel(r)}: ${count}`} title={`${resourceLabel(r)}: ${count}`}>
                      <div className="star-home-resstack">
                        {extraCount > 0 ? <div className="star-home-resstack-over">+{extraCount}</div> : null}
                        {visibleCount > 0
                          ? Array.from({ length: visibleCount }).map((_, i) => (
                              <span key={i} className="star-res-tile-wrap">
                                <img className="star-res-tile-img star-mini-hex" src={src} alt="" draggable={false} />
                              </span>
                            ))
                          : [
                              <span key="missing" className="star-res-tile-wrap missing">
                                <img className="star-res-tile-img star-mini-hex" src={src} alt="" draggable={false} />
                              </span>,
                            ]}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className={`star-home-card ${state.players[state.currentPlayerIndex]?.id === meId ? 'active' : ''}`}>
                <div className="star-corner-head">
                  <div className="star-corner-avatar-col">
                    <button
                      type="button"
                      className={`star-home-avatar-btn ${selectedPlayerId === meId ? 'selected' : ''}`}
                      aria-label={me?.name ?? 'Du'}
                      title={me?.name ?? 'Du'}
                      onClick={() => setSelectedPlayerId((cur) => (cur === meId ? null : meId))}
                      style={{ ['--pclr']: playerColor(me?.color ?? 'blue') } as CSSProperties & { ['--pclr']: string }}
                    >
                      {me?.avatarUrl ? (
                        <img className="star-corner-avatar" src={me.avatarUrl} alt="" draggable={false} style={{ background: playerColor(me?.color ?? 'blue') }} />
                      ) : (
                        <div className="star-corner-dot" style={{ background: playerColor(me?.color ?? 'blue') }} />
                      )}
                    </button>
                    {state.players[state.currentPlayerIndex]?.id === meId ? <div className="star-corner-turn-under">{t.turnNow}</div> : null}
                  </div>
                  <div className="star-corner-info">
                    <div className="star-corner-name">{me?.name ?? 'Du'}</div>
                    <div className="star-corner-stats">{t.pts}: {me?.score ?? 0} · {t.res}: {sumResources(me?.resources ?? { metal: 0, gas: 0, crystal: 0, food: 0, data: 0 })}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="star-float-bottom-right" aria-hidden="true" />
      </div>
      <div
        className={`star-action-dock ${isMyTurn && state.status !== 'lobby' && state.status !== 'finished' ? 'on-turn' : ''}`}
        aria-label="Aktionen"
        style={
          {
            ['--pclr']: playerColor(me?.color ?? 'blue'),
            top: actionDockTopPx ? `${actionDockTopPx}px` : '50%',
          } as CSSProperties & { ['--pclr']: string }
        }
      >
        <div ref={actionDockGroupRef} className={`star-action-dock-group ${actionDockTwoCol ? 'two-col' : ''}`}>
          <div className="star-action-col secondary" aria-label="Weitere">
            <button type="button" className={`star-btn icon-only star-action-dock-btn ${openMenu === 'chat' ? 'active' : ''}`} aria-label={t.chat} title={t.chat} onClick={() => setOpenMenu((m) => (m === 'chat' ? null : 'chat'))}>
              <span className="material-symbols-rounded" aria-hidden="true">chat</span>
            </button>
            <button type="button" className={`star-btn icon-only star-action-dock-btn ${openMenu === 'recipes' ? 'active' : ''}`} aria-label={t.recipes} title={t.recipes} onClick={() => setOpenMenu((m) => (m === 'recipes' ? null : 'recipes'))}>
              <span className="material-symbols-rounded" aria-hidden="true">menu_book</span>
            </button>
            <button type="button" className="star-btn icon-only star-action-dock-btn" aria-label={t.endTurn} title={t.endTurn} onClick={endTurn} disabled={!isMyTurn || state.status !== 'playing' || state.phase === 'wormhole'}>
              <span className="material-symbols-rounded" aria-hidden="true">autorenew</span>
            </button>
          </div>

          <div className="star-action-col primary" aria-label="Aktionen">
            {!isSetup ? (
              <button
                type="button"
                className={`star-action-dice-btn ${canRollNow ? 'needs-roll' : ''}`}
                aria-label="Würfeln"
                title="Würfeln"
                onClick={rollDice}
                disabled={!canRollNow}
              >
                <div className="star-dice-row star-action-dice-stack" aria-hidden="true">
                  <DiceCube value={d1} rolling={isRolling} />
                  <DiceCube value={d2} rolling={isRolling} />
                </div>
              </button>
            ) : null}

            <button
              type="button"
              className={`star-btn icon-only star-action-dock-btn ${openMenu === 'build' ? 'active' : ''} ${isMyTurn && canBuildAnyNow ? 'inverted' : ''} ${isMyTurn && canBuildAnyNow ? 'star-pulse' : ''}`}
              onClick={() => {
                setMode('none')
                setPendingVertex(null)
                setPendingWarpFrom(null)
                setOpenMenu((m) => (m === 'build' ? null : 'build'))
              }}
              disabled={!isMyTurn || state.phase !== 'main'}
              aria-label={t.build}
              title={t.build}
            >
              <span className="material-symbols-rounded" aria-hidden="true">hardware</span>
            </button>

            {!isSetup ? (
              <button
                type="button"
                className={`star-btn icon-only star-action-dock-btn ${openMenu === 'market' ? 'active' : ''} ${isMyTurn && state.status === 'playing' && state.phase === 'main' && sumResources(me?.resources ?? { metal: 0, gas: 0, crystal: 0, food: 0, data: 0 }) > 0 ? 'inverted star-pulse' : ''}`}
                onClick={() => {
                  setMode('none')
                  setPendingVertex(null)
                  setPendingWarpFrom(null)
                  setOpenMenu((m) => {
                    const next = m === 'market' ? null : 'market'
                    if (next === 'market') {
                      setMarketTab('players')
                    }
                    return next
                  })
                }}
                disabled={!isMyTurn || state.status !== 'playing' || state.phase !== 'main'}
                aria-label={t.market}
                title={t.market}
              >
                <span className="material-symbols-rounded" aria-hidden="true">handshake</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="star-corner-grid-fixed" style={{ top: topUiInset + 10, bottom: 10 }}>
        {corners.map((p, idx) => {
          if (!p) return null
          const isCurrent = p.id === state.players[state.currentPlayerIndex]?.id
          const clr = playerColor(p.color)
          const style = {
            ['--pclr']: clr,
            borderColor: isCurrent ? clr : `${clr}88`,
          } as CSSProperties & { ['--pclr']: string }
          return (
          <div
            key={idx}
            ref={(el) => {
              if (!p) return
              cornerRefByPlayerId.current[p.id] = el
            }}
            className={`star-corner ${cornerSlots[idx]} ${isCurrent ? 'active' : ''}`}
            style={style}
          >
            {p ? (
              <>
                <div className="star-corner-head">
                  <div className="star-corner-avatar-col">
                    {p.isBot ? (
                      <img src="/avatars/bot.jpg" alt={p.name} className="star-corner-avatar" style={{ background: playerColor(p.color) }} />
                    ) : p.avatarUrl ? (
                      <img src={p.avatarUrl} alt={p.name} className="star-corner-avatar" style={{ background: playerColor(p.color) }} />
                    ) : (
                      <div className="star-corner-dot" style={{ background: playerColor(p.color) }} />
                    )}
                    {isCurrent ? <div className="star-corner-turn-under">{t.turnNow}</div> : null}
                  </div>
                  <div className="star-corner-info">
                    <div className="star-corner-name">{p.name}{p.isBot ? ' (Bot)' : ''}</div>
                    <div className="star-corner-stats">{t.pts}: {p.score} · {t.res}: {sumResources(p.resources)}</div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          )
        })}
      </div>
      <div className="star-resource-fx-layer" aria-hidden="true">
        {resourceFx.map((fx) => {
          const style = {
            left: fx.fromX,
            top: fx.fromY,
            '--dx': `${fx.toX - fx.fromX}px`,
            '--dy': `${fx.toY - fx.fromY}px`,
          } as CSSProperties & { ['--dx']: string; ['--dy']: string }
          return (
            <img
              key={fx.id}
              className="star-resource-fx"
              src={resourceIconSrc(fx.resource)}
              alt=""
              style={style}
            />
          )
        })}
      </div>
    </div>
  )
}

export function GamePage() {
  const { gameId } = useParams()
  const { user } = useAuth()
  if (!gameId || !user) return <div className="page"><div className="loading">Lädt…</div></div>
  return (
    <GameStateProvider gameId={gameId} playerId={user.id} playerName={user.name} avatarUrl={user.avatarUrl ?? ''}>
      <GameInner />
    </GameStateProvider>
  )
}
