import { randomUUID } from "node:crypto";
import { createBoard, rotateOuterRing } from "./board";
import { BIOME_TO_RESOURCE } from "./types";
import type {
  Biome,
  BoardEdge,
  DiceRoll,
  EdgeId,
  GameEvent,
  GameState,
  Player,
  PlayerColor,
  Resource,
  SetupState,
  Station,
  TileId,
  TradeOffer,
  VertexId,
  WarpLane,
  WormholeMove,
} from "./types";

const playerColors: PlayerColor[] = ["red", "blue", "green", "yellow"];

function emptyResources(): Record<Resource, number> {
  return { metal: 0, gas: 0, crystal: 0, food: 0, data: 0 };
}

function sumResources(r: Record<Resource, number>) {
  return Object.values(r).reduce((a, b) => a + b, 0);
}

function addEvent(state: GameState, text: string): GameState {
  const ev: GameEvent = { id: randomUUID(), timestamp: Date.now(), text };
  const next = state.events.concat(ev);
  return { ...state, events: next.length > 80 ? next.slice(next.length - 80) : next };
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function createInitialGame(
  creatorId: string,
  creatorName: string,
  avatarUrl?: string,
  params?: { radius?: number; maxRounds?: number; botCount?: number; turnLimitSec?: number },
): GameState {
  const radius = Math.min(6, Math.max(2, params?.radius ?? 3));
  const maxRounds = Math.min(50, Math.max(5, params?.maxRounds ?? 50));
  const botCount = Math.min(3, Math.max(0, params?.botCount ?? 0));
  const turnLimitMs = Math.min(10 * 60 * 1000, Math.max(15 * 1000, Math.floor((params?.turnLimitSec ?? 45) * 1000)));
  const board = createBoard({ radius, size: 56 });

  const players: Player[] = [
    {
      id: creatorId,
      name: creatorName,
      color: playerColors[0]!,
      avatarUrl: avatarUrl,
      isBot: false,
      score: 0,
      resources: emptyResources(),
    },
  ];

  for (let i = 0; i < botCount; i++) {
    const color = playerColors[players.length]!;
    players.push({
      id: `bot:${i + 1}`,
      name: `Bot ${i + 1}`,
      color,
      avatarUrl: undefined,
      isBot: true,
      score: 0,
      resources: emptyResources(),
    });
  }

  const centerTile = board.tiles.find((t) => t.q === 0 && t.r === 0)?.id ?? board.tiles[0]!.id;

  const game: GameState = {
    id: randomUUID(),
    status: "lobby",
    creatorId,
    players,
    currentPlayerIndex: 0,
    round: 1,
    roundStartedAt: Date.now(),
    maxRounds,
    turnLimitMs,
    phase: "await_roll",
    setup: null,
    board,
    stations: [],
    hyperlanes: [],
    warpLanes: [],
    blackHoleTileId: centerTile,
    blackHolePool: emptyResources(),
    tradeOffers: [],
    lastDiceRoll: null,
    winnerPlayerId: null,
    chatMessages: [],
    events: [],
    turnStartedAt: Date.now(),
  };

  return addEvent(game, "Lobby erstellt.");
}

function createSetupState(state: GameState, step: 1 | 2): SetupState {
  const placementsByPlayerId: SetupState["placementsByPlayerId"] = {};
  for (const p of state.players) {
    placementsByPlayerId[p.id] = { stationsPlaced: 0, hyperlanesPlaced: 0 };
  }
  return {
    step,
    direction: step === 1 ? 1 : -1,
    required: "station",
    placementsByPlayerId,
  };
}

export function startGame(state: GameState): GameState {
  if (state.status !== "lobby") return state;
  if (state.players.length < 2) return state;
  const shuffledPlayers = state.players.slice();
  for (let i = shuffledPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffledPlayers[i]!;
    shuffledPlayers[i] = shuffledPlayers[j]!;
    shuffledPlayers[j] = tmp;
  }
  const withPlayers: GameState = { ...state, players: shuffledPlayers };
  const next: GameState = {
    ...withPlayers,
    status: "setup_phase_1",
    phase: "main",
    setup: createSetupState(withPlayers, 1),
    lastDiceRoll: null,
    currentPlayerIndex: 0,
    roundStartedAt: Date.now(),
    turnStartedAt: Date.now(),
  };
  const starter = next.players[0]?.name ?? "—";
  return addEvent(next, `Spiel startet. Startspieler: ${starter}. Setup Phase 1: Jeder platziert 1 Station + 1 Hyperlane (1→N).`);
}

function currentPlayer(state: GameState) {
  return state.players[state.currentPlayerIndex] ?? null;
}

function isMyTurn(state: GameState, playerId: string) {
  const p = currentPlayer(state);
  return Boolean(p && p.id === playerId);
}

function canAfford(resources: Record<Resource, number>, cost: Partial<Record<Resource, number>>) {
  for (const [k, v] of Object.entries(cost) as Array<[Resource, number]>) {
    if ((resources[k] ?? 0) < (v ?? 0)) return false;
  }
  return true;
}

function spend(resources: Record<Resource, number>, cost: Partial<Record<Resource, number>>) {
  const next = { ...resources };
  for (const [k, v] of Object.entries(cost) as Array<[Resource, number]>) {
    next[k] = (next[k] ?? 0) - (v ?? 0);
  }
  return next;
}

function stationsByVertex(state: GameState) {
  const m = new Map<VertexId, Station>();
  for (const s of state.stations) m.set(s.vertexId, s);
  return m;
}

function edgeById(state: GameState) {
  const m = new Map<EdgeId, BoardEdge>();
  for (const e of state.board.edges) m.set(e.id, e);
  return m;
}

function ownedHyperlanes(state: GameState, playerId: string) {
  return state.hyperlanes.filter((h) => h.playerId === playerId);
}

function hasConnectionToEdge(state: GameState, playerId: string, edge: BoardEdge) {
  const myStations = state.stations.filter((s) => s.playerId === playerId);
  if (myStations.some((s) => s.vertexId === edge.a || s.vertexId === edge.b)) return true;
  const myEdges = ownedHyperlanes(state, playerId)
    .map((h) => edgeById(state).get(h.edgeId))
    .filter(Boolean) as BoardEdge[];
  return myEdges.some((e) => e.a === edge.a || e.b === edge.a || e.a === edge.b || e.b === edge.b);
}

function axialDistance(q: number, r: number) {
  const x = q;
  const z = r;
  const y = -x - z;
  return (Math.abs(x) + Math.abs(y) + Math.abs(z)) / 2;
}

function boundaryVertices(state: GameState) {
  const out = new Set<VertexId>();
  for (const t of state.board.tiles) {
    if (axialDistance(t.q, t.r) === state.board.radius) {
      for (const v of t.cornerVertexIds) out.add(v);
    }
  }
  return out;
}

function violatesStationDistanceRule(state: GameState, vertexId: VertexId) {
  if (state.stations.some((s) => s.vertexId === vertexId)) return true;

  const neighborsByVertex = new Map<VertexId, VertexId[]>();
  for (const e of state.board.edges) {
    const aList = neighborsByVertex.get(e.a) ?? [];
    aList.push(e.b);
    neighborsByVertex.set(e.a, aList);
    const bList = neighborsByVertex.get(e.b) ?? [];
    bList.push(e.a);
    neighborsByVertex.set(e.b, bList);
  }

  for (const s of state.stations) {
    const neigh = neighborsByVertex.get(s.vertexId) ?? [];
    if (neigh.includes(vertexId)) return true;
  }
  return false;
}

function isSetupStatus(status: GameState["status"]) {
  return status === "setup_phase_1" || status === "setup_phase_2";
}

function getSetupCounts(state: GameState, playerId: string) {
  const fallback = { stationsPlaced: 0, hyperlanesPlaced: 0 };
  if (!state.setup) return fallback;
  return state.setup.placementsByPlayerId[playerId] ?? fallback;
}

function setSetupCounts(state: GameState, playerId: string, nextCounts: { stationsPlaced: number; hyperlanesPlaced: number }): GameState {
  if (!state.setup) return state;
  return {
    ...state,
    setup: {
      ...state.setup,
      placementsByPlayerId: {
        ...state.setup.placementsByPlayerId,
        [playerId]: nextCounts,
      },
    },
  };
}

function giveSetup2StartResources(state: GameState, playerId: string, vertexId: VertexId): GameState {
  const tiles = state.board.tiles.filter((t) => t.cornerVertexIds.includes(vertexId));
  let next = state;
  const me = next.players.find((p) => p.id === playerId) ?? null;
  if (!me) return next;

  const gain: Partial<Record<Resource, number>> = {};
  for (const tile of tiles) {
    if (tile.biome === "singularity") continue;
    const res = BIOME_TO_RESOURCE[tile.biome as Exclude<Biome, "singularity">];
    gain[res] = (gain[res] ?? 0) + 1;
  }

  if (Object.keys(gain).length === 0) return next;
  const players = next.players.map((p) => {
    if (p.id !== playerId) return p;
    const resources = { ...p.resources };
    for (const [k, v] of Object.entries(gain) as Array<[Resource, number]>) {
      resources[k] = (resources[k] ?? 0) + (v ?? 0);
    }
    return { ...p, resources };
  });
  next = { ...next, players };

  const parts = (Object.entries(gain) as Array<[Resource, number]>)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
  return addEvent(next, `Startressourcen für ${me.name}: ${parts}.`);
}

function advanceSetupAfterHyperlane(state: GameState): GameState {
  if (!state.setup) return state;

  if (state.status === "setup_phase_1") {
    const isLast = state.currentPlayerIndex === state.players.length - 1;
    if (isLast) {
      const next: GameState = {
        ...state,
        status: "setup_phase_2",
        currentPlayerIndex: state.players.length - 1,
        setup: {
          ...state.setup,
          step: 2,
          direction: -1,
          required: "station",
        },
        turnStartedAt: Date.now(),
      };
      return addEvent(next, "Setup Phase 2: Jeder platziert 1 Station + 1 Hyperlane (N→1).");
    }
    return {
      ...state,
      currentPlayerIndex: state.currentPlayerIndex + 1,
      setup: { ...state.setup, required: "station" },
    };
  }

  if (state.status === "setup_phase_2") {
    const isFirst = state.currentPlayerIndex === 0;
    if (isFirst) {
      const next: GameState = {
        ...state,
        status: "playing",
        setup: null,
        currentPlayerIndex: 0,
        phase: "await_roll",
        lastDiceRoll: null,
        roundStartedAt: Date.now(),
        turnStartedAt: Date.now(),
      };
      return addEvent(next, "Hauptspiel startet. Spieler 1 ist dran.");
    }
    return {
      ...state,
      currentPlayerIndex: state.currentPlayerIndex - 1,
      setup: { ...state.setup, required: "station" },
    };
  }

  return state;
}

function distributeProduction(state: GameState, roll: DiceRoll): GameState {
  if (roll.sum === 7) return state;

  const stationsAt = stationsByVertex(state);
  const tiles = state.board.tiles.filter((t) => t.numberToken === roll.sum);
  let next = state;

  for (const tile of tiles) {
    if (tile.id === state.blackHoleTileId) continue;
    if (tile.biome === "singularity") continue;

    const res = BIOME_TO_RESOURCE[tile.biome as Exclude<Biome, "singularity">];
    const affectedStationVertices = tile.cornerVertexIds
      .map((v) => stationsAt.get(v))
      .filter(Boolean) as Station[];

    if (affectedStationVertices.length === 0) continue;

    const playerGain = new Map<string, number>();
    for (const st of affectedStationVertices) {
      const amount = st.level === "starbase" ? 2 : 1;
      playerGain.set(st.playerId, (playerGain.get(st.playerId) ?? 0) + amount);
    }

    const players = next.players.map((p) => {
      const gain = playerGain.get(p.id) ?? 0;
      if (!gain) return p;
      return { ...p, resources: { ...p.resources, [res]: (p.resources[res] ?? 0) + gain } };
    });
    next = { ...next, players };
  }

  return next;
}

function maybeBlackHoleSteal(state: GameState): GameState {
  const trigger = rollDie() === 1;
  if (!trigger) return state;

  const blackHoleTile = state.board.tiles.find((t) => t.id === state.blackHoleTileId);
  if (!blackHoleTile) return state;

  const stationsAt = stationsByVertex(state);
  const affectedPlayerIds = new Set(
    blackHoleTile.cornerVertexIds
      .map((v) => stationsAt.get(v))
      .filter(Boolean)
      .map((s) => s!.playerId),
  );

  const affected = state.players.filter((p) => affectedPlayerIds.has(p.id));
  if (affected.length === 0) return state;

  const minTotal = Math.min(...affected.map((p) => sumResources(p.resources)));
  if (minTotal <= 0) return addEvent(state, "Schwarzes Loch: Keine Rohstoffe zum Abziehen.");

  const pool = { ...state.blackHolePool };
  const nextPlayers = state.players.map((p) => {
    if (!affectedPlayerIds.has(p.id)) return p;
    const available = (Object.entries(p.resources) as Array<[Resource, number]>).filter(([, v]) => v > 0);
    if (available.length === 0) return p;
    const [picked] = available[Math.floor(Math.random() * available.length)]!;
    pool[picked] = (pool[picked] ?? 0) + 1;
    return { ...p, resources: { ...p.resources, [picked]: p.resources[picked] - 1 } };
  });

  const names = affected.map((p) => p.name).join(", ");
  return addEvent({ ...state, players: nextPlayers, blackHolePool: pool }, `Schwarzes Loch: 1 Rohstoff von ${names} verschluckt.`);
}

export function handleRoll(state: GameState, playerId: string): { state: GameState; requiresWormhole: boolean } {
  if (state.status !== "playing" || state.winnerPlayerId) return { state, requiresWormhole: false };
  if (!isMyTurn(state, playerId)) return { state, requiresWormhole: false };
  if (state.phase !== "await_roll") return { state, requiresWormhole: false };

  const d1 = rollDie();
  const d2 = rollDie();
  const roll: DiceRoll = { d1, d2, sum: d1 + d2 };

  let next: GameState = { ...state, lastDiceRoll: roll };
  next = addEvent(next, `${currentPlayer(next)?.name ?? "Spieler"} würfelt ${roll.d1}+${roll.d2}=${roll.sum}.`);

  if (roll.sum === 7) {
    next = { ...next, phase: "wormhole" };
    next = addEvent(next, "Wormhole-Jump: Schwarzes Loch versetzen + bis zu 2 Hyperlanes teleportieren.");
    return { state: next, requiresWormhole: true };
  }

  next = distributeProduction(next, roll);
  next = maybeBlackHoleSteal(next);
  next = { ...next, phase: "main" };
  return { state: next, requiresWormhole: false };
}

export function resolveWormhole(state: GameState, playerId: string, params: { newBlackHoleTileId: TileId; moves?: WormholeMove[] }): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (!isMyTurn(state, playerId)) return state;
  if (state.phase !== "wormhole") return state;

  const tile = state.board.tiles.find((t) => t.id === params.newBlackHoleTileId);
  if (!tile) return state;

  const edgeMap = edgeById(state);
  const occupiedEdges = new Set(state.hyperlanes.map((h) => h.edgeId));
  const myEdges = new Set(state.hyperlanes.filter((h) => h.playerId === playerId).map((h) => h.edgeId));

  let hyperlanes = state.hyperlanes.slice();
  const requested = (params.moves ?? []).slice(0, 2);

  for (const m of requested) {
    if (!myEdges.has(m.fromEdgeId)) continue;
    if (!edgeMap.has(m.fromEdgeId) || !edgeMap.has(m.toEdgeId)) continue;
    if (occupiedEdges.has(m.toEdgeId)) continue;

    const idx = hyperlanes.findIndex((h) => h.playerId === playerId && h.edgeId === m.fromEdgeId);
    if (idx === -1) continue;
    hyperlanes[idx] = { ...hyperlanes[idx]!, edgeId: m.toEdgeId };
    occupiedEdges.delete(m.fromEdgeId);
    occupiedEdges.add(m.toEdgeId);
  }

  let next: GameState = { ...state, blackHoleTileId: tile.id, hyperlanes, phase: "main" as const };
  next = addEvent(next, "Wormhole-Jump abgeschlossen.");
  return next;
}

export function buildStation(state: GameState, playerId: string, vertexId: VertexId): GameState {
  if ((state.status !== "playing" && !isSetupStatus(state.status)) || state.winnerPlayerId) return state;
  if (!isMyTurn(state, playerId)) return state;
  if (state.phase !== "main") return state;
  if (isSetupStatus(state.status) && state.setup?.required !== "station") return state;

  if (!state.board.vertices.some((v) => v.id === vertexId)) return state;
  if (violatesStationDistanceRule(state, vertexId)) return state;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;

  const isSetup = isSetupStatus(state.status);
  const cost: Partial<Record<Resource, number>> = isSetup ? {} : { metal: 1, gas: 1, food: 1, crystal: 1 };
  if (!isSetup && !canAfford(me.resources, cost)) return state;

  const countsBefore = isSetup ? getSetupCounts(state, playerId) : null;
  if (isSetup) {
    const limit = state.status === "setup_phase_1" ? 1 : 2;
    if ((countsBefore?.stationsPlaced ?? 0) >= limit) return state;
  }

  const myHasAnything = state.stations.some((s) => s.playerId === playerId) || state.hyperlanes.some((h) => h.playerId === playerId);
  const allowDisconnectedSetup2Station =
    isSetup && state.status === "setup_phase_2" && state.setup?.required === "station" && (countsBefore?.stationsPlaced ?? 0) === 1;

  if (myHasAnything && !allowDisconnectedSetup2Station) {
    const connected = state.hyperlanes
      .filter((h) => h.playerId === playerId)
      .map((h) => edgeById(state).get(h.edgeId))
      .filter(Boolean) as BoardEdge[];
    const ok =
      state.stations.some((s) => s.playerId === playerId && s.vertexId === vertexId) ||
      connected.some((e) => e.a === vertexId || e.b === vertexId);
    if (!ok) return state;
  }

  let next: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, resources: spend(p.resources, cost), score: p.score + 1 } : p)),
    stations: state.stations.concat({ id: randomUUID(), playerId, vertexId, level: "station" }),
  };
  next = addEvent(next, `${me.name} baut eine Raumstation (+1 Punkt).`);

  if (isSetup) {
    const counts = getSetupCounts(next, playerId);
    next = setSetupCounts(next, playerId, { ...counts, stationsPlaced: counts.stationsPlaced + 1 });
    next = { ...next, setup: { ...next.setup!, required: "hyperlane" } };
    if (next.status === "setup_phase_2") {
      next = giveSetup2StartResources(next, playerId, vertexId);
    }
  }

  return next;
}

export function upgradeToStarbase(state: GameState, playerId: string, vertexId: VertexId): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (!isMyTurn(state, playerId)) return state;
  if (state.phase !== "main") return state;

  const idx = state.stations.findIndex((s) => s.playerId === playerId && s.vertexId === vertexId && s.level === "station");
  if (idx === -1) return state;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;

  const cost: Partial<Record<Resource, number>> = { data: 3, crystal: 2 };
  if (!canAfford(me.resources, cost)) return state;

  const stations = state.stations.slice();
  stations[idx] = { ...stations[idx]!, level: "starbase" };

  const players = state.players.map((p) => (p.id === playerId ? { ...p, resources: spend(p.resources, cost), score: p.score + 1 } : p));
  return addEvent({ ...state, players, stations }, `${me.name} upgraded zur Sternenbasis (+1 Punkt).`);
}

export function buildHyperlane(state: GameState, playerId: string, edgeIdValue: EdgeId): GameState {
  if ((state.status !== "playing" && !isSetupStatus(state.status)) || state.winnerPlayerId) return state;
  if (!isMyTurn(state, playerId)) return state;
  if (state.phase !== "main") return state;
  if (isSetupStatus(state.status) && state.setup?.required !== "hyperlane") return state;

  const edge = state.board.edges.find((e) => e.id === edgeIdValue);
  if (!edge) return state;
  if (state.hyperlanes.some((h) => h.edgeId === edgeIdValue)) return state;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;

  const isSetup = isSetupStatus(state.status);
  const cost: Partial<Record<Resource, number>> = isSetup ? {} : { metal: 1, gas: 1 };
  if (!isSetup && !canAfford(me.resources, cost)) return state;

  if (isSetup) {
    const counts = getSetupCounts(state, playerId);
    const limit = state.status === "setup_phase_1" ? 1 : 2;
    if (counts.hyperlanesPlaced >= limit) return state;
  }

  const myHasAnything = state.stations.some((s) => s.playerId === playerId) || state.hyperlanes.some((h) => h.playerId === playerId);
  if (myHasAnything && !hasConnectionToEdge(state, playerId, edge)) return state;

  let next: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, resources: spend(p.resources, cost) } : p)),
    hyperlanes: state.hyperlanes.concat({ id: randomUUID(), playerId, edgeId: edgeIdValue }),
  };
  next = addEvent(next, `${me.name} baut eine Hyperlane.`);

  if (isSetup) {
    const counts = getSetupCounts(next, playerId);
    next = setSetupCounts(next, playerId, { ...counts, hyperlanesPlaced: counts.hyperlanesPlaced + 1 });
    next = advanceSetupAfterHyperlane(next);
  }

  return next;
}

export function buildWarpLane(state: GameState, playerId: string, params: { fromVertexId: VertexId; toVertexId: VertexId }): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (!isMyTurn(state, playerId)) return state;
  if (state.phase !== "main") return state;
  if (params.fromVertexId === params.toVertexId) return state;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;

  const boundary = boundaryVertices(state);
  if (!boundary.has(params.fromVertexId) || !boundary.has(params.toVertexId)) return state;

  const hasStationAtFrom = state.stations.some((s) => s.playerId === playerId && s.vertexId === params.fromVertexId);
  if (!hasStationAtFrom) return state;

  const exists = state.warpLanes.some(
    (w) =>
      w.playerId === playerId &&
      ((w.fromVertexId === params.fromVertexId && w.toVertexId === params.toVertexId) ||
        (w.fromVertexId === params.toVertexId && w.toVertexId === params.fromVertexId)),
  );
  if (exists) return state;

  const cost: Partial<Record<Resource, number>> = { metal: 2, gas: 2, crystal: 2, food: 2, data: 2 };
  if (!canAfford(me.resources, cost)) return state;

  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, resources: spend(p.resources, cost) } : p,
  );

  const warp: WarpLane = {
    id: randomUUID(),
    playerId,
    fromVertexId: params.fromVertexId,
    toVertexId: params.toVertexId,
  };

  return addEvent({ ...state, players, warpLanes: state.warpLanes.concat(warp) }, `${me.name} baut eine Warp-Lane.`);
}

export function tradeBlackMarket(
  state: GameState,
  playerId: string,
  params: { give: Resource; receive: Resource },
): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (!isMyTurn(state, playerId)) return state;
  if (state.phase !== "main") return state;
  if (params.give === params.receive) return state;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;
  if ((state.blackHolePool[params.receive] ?? 0) <= 0) return state;

  const rate = getBlackHoleRate(state.blackHolePool, params.receive);
  if (!rate) return state;
  if ((me.resources[params.give] ?? 0) < rate) return state;

  const pool = { ...state.blackHolePool };
  pool[params.receive] = Math.max(0, (pool[params.receive] ?? 0) - 1);
  pool[params.give] = (pool[params.give] ?? 0) + rate;

  const players = state.players.map((p) => {
    if (p.id !== playerId) return p;
    return {
      ...p,
      resources: {
        ...p.resources,
        [params.give]: p.resources[params.give] - rate,
        [params.receive]: p.resources[params.receive] + 1,
      },
    };
  });
  return addEvent(
    { ...state, players, blackHolePool: pool },
    `${me.name} handelt mit dem Schwarzen Loch: ${rate} ${params.give} -> 1 ${params.receive}.`,
  );
}

function computeBlackHoleRates(pool: Record<Resource, number>) {
  const available = (Object.keys(pool) as Resource[])
    .map((r) => ({ r, n: pool[r] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.r.localeCompare(b.r));

  const result = new Map<Resource, number>();
  const n = available.length;
  if (n === 0) return result;
  if (n === 1) {
    result.set(available[0]!.r, 2);
    return result;
  }
  if (n === 2) {
    result.set(available[0]!.r, 2);
    result.set(available[1]!.r, 4);
    return result;
  }

  const topCount = Math.ceil(n / 3);
  const midCount = Math.ceil((n - topCount) / 2);
  for (let i = 0; i < n; i++) {
    const rate = i < topCount ? 2 : i < topCount + midCount ? 3 : 4;
    result.set(available[i]!.r, rate);
  }
  return result;
}

function getBlackHoleRate(pool: Record<Resource, number>, receive: Resource): number | null {
  if ((pool[receive] ?? 0) <= 0) return null;
  return computeBlackHoleRates(pool).get(receive) ?? 4;
}

function normalizeAmounts(input: Partial<Record<Resource, number>> | undefined): Partial<Record<Resource, number>> {
  const out: Partial<Record<Resource, number>> = {};
  if (!input) return out;
  for (const r of ["metal", "gas", "crystal", "food", "data"] as Resource[]) {
    const raw = (input as any)[r];
    if (typeof raw !== "number") continue;
    const v = Math.floor(raw);
    if (!Number.isFinite(v) || v <= 0) continue;
    out[r] = Math.min(20, v);
  }
  return out;
}

function sumAmounts(amounts: Partial<Record<Resource, number>>): number {
  return (Object.values(amounts) as number[]).reduce((a, b) => a + (b ?? 0), 0);
}

function canPay(player: Player, cost: Partial<Record<Resource, number>>) {
  for (const [k, v] of Object.entries(cost) as Array<[Resource, number]>) {
    if ((player.resources[k] ?? 0) < (v ?? 0)) return false;
  }
  return true;
}

function applyDelta(resources: Record<Resource, number>, delta: Partial<Record<Resource, number>>, sign: 1 | -1) {
  const next = { ...resources };
  for (const [k, v] of Object.entries(delta) as Array<[Resource, number]>) {
    next[k] = (next[k] ?? 0) + sign * (v ?? 0);
  }
  return next;
}

function pruneTradeOffers(tradeOffers: TradeOffer[]) {
  const keep = tradeOffers.slice(-40);
  return keep;
}

export function createTradeOffer(
  state: GameState,
  playerId: string,
  params: { toPlayerId?: string | null; give: Partial<Record<Resource, number>>; want: Partial<Record<Resource, number>> },
): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (!isMyTurn(state, playerId)) return state;
  if (state.phase !== "main") return state;

  const give = normalizeAmounts(params.give);
  const want = normalizeAmounts(params.want);
  if (sumAmounts(give) <= 0 || sumAmounts(want) <= 0) return state;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;
  if (!canPay(me, give)) return state;

  const toPlayerId = typeof params.toPlayerId === "string" ? params.toPlayerId : null;
  if (toPlayerId && !state.players.some((p) => p.id === toPlayerId && p.id !== playerId)) return state;

  const now = Date.now();
  const offer: TradeOffer = {
    id: randomUUID(),
    fromPlayerId: playerId,
    toPlayerId,
    give,
    want,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  const nextOffers = pruneTradeOffers(state.tradeOffers.concat(offer));
  return addEvent({ ...state, tradeOffers: nextOffers }, `${me.name} erstellt ein Handelsangebot.`);
}

export function cancelTradeOffer(state: GameState, playerId: string, params: { offerId: string }): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (state.phase !== "main") return state;

  const idx = state.tradeOffers.findIndex((o) => o.id === params.offerId);
  if (idx === -1) return state;
  const offer = state.tradeOffers[idx]!;
  if (offer.status !== "open") return state;
  if (offer.fromPlayerId !== playerId) return state;

  const now = Date.now();
  const tradeOffers = state.tradeOffers.slice();
  tradeOffers[idx] = { ...offer, status: "cancelled", updatedAt: now };
  const me = state.players.find((p) => p.id === playerId);
  return addEvent({ ...state, tradeOffers }, `${me?.name ?? "Spieler"} zieht ein Handelsangebot zurück.`);
}

export function declineTradeOffer(state: GameState, playerId: string, params: { offerId: string }): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (state.phase !== "main") return state;

  const idx = state.tradeOffers.findIndex((o) => o.id === params.offerId);
  if (idx === -1) return state;
  const offer = state.tradeOffers[idx]!;
  if (offer.status !== "open") return state;
  if (offer.fromPlayerId === playerId) return state;
  if (offer.toPlayerId && offer.toPlayerId !== playerId) return state;

  const now = Date.now();
  const tradeOffers = state.tradeOffers.slice();
  tradeOffers[idx] = { ...offer, status: "declined", updatedAt: now };
  const me = state.players.find((p) => p.id === playerId);
  return addEvent({ ...state, tradeOffers }, `${me?.name ?? "Spieler"} lehnt ein Handelsangebot ab.`);
}

export function acceptTradeOffer(state: GameState, playerId: string, params: { offerId: string }): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (state.phase !== "main") return state;

  const idx = state.tradeOffers.findIndex((o) => o.id === params.offerId);
  if (idx === -1) return state;
  const offer = state.tradeOffers[idx]!;
  if (offer.status !== "open") return state;
  if (offer.fromPlayerId === playerId) return state;
  if (offer.toPlayerId && offer.toPlayerId !== playerId) return state;
  if (!isMyTurn(state, offer.fromPlayerId)) return state;

  const from = state.players.find((p) => p.id === offer.fromPlayerId);
  const to = state.players.find((p) => p.id === playerId);
  if (!from || !to) return state;
  if (!canPay(from, offer.give)) return state;
  if (!canPay(to, offer.want)) return state;

  const players = state.players.map((p) => {
    if (p.id === from.id) {
      return { ...p, resources: applyDelta(applyDelta(p.resources, offer.give, -1), offer.want, +1) };
    }
    if (p.id === to.id) {
      return { ...p, resources: applyDelta(applyDelta(p.resources, offer.want, -1), offer.give, +1) };
    }
    return p;
  });

  const now = Date.now();
  const tradeOffers = state.tradeOffers.slice();
  tradeOffers[idx] = { ...offer, status: "accepted", updatedAt: now };
  return addEvent({ ...state, players, tradeOffers }, `${to.name} akzeptiert ein Handelsangebot von ${from.name}.`);
}

export function counterTradeOffer(
  state: GameState,
  playerId: string,
  params: { offerId: string; give: Partial<Record<Resource, number>>; want: Partial<Record<Resource, number>> },
): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (state.phase !== "main") return state;

  const idx = state.tradeOffers.findIndex((o) => o.id === params.offerId);
  if (idx === -1) return state;
  const original = state.tradeOffers[idx]!;
  if (original.status !== "open") return state;
  if (original.fromPlayerId === playerId) return state;
  if (original.toPlayerId && original.toPlayerId !== playerId) return state;
  if (!isMyTurn(state, original.fromPlayerId)) return state;

  const give = normalizeAmounts(params.give);
  const want = normalizeAmounts(params.want);
  if (sumAmounts(give) <= 0 || sumAmounts(want) <= 0) return state;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;
  if (!canPay(me, give)) return state;

  const now = Date.now();
  const offer: TradeOffer = {
    id: randomUUID(),
    fromPlayerId: playerId,
    toPlayerId: original.fromPlayerId,
    give,
    want,
    status: "open",
    counterOfId: original.id,
    createdAt: now,
    updatedAt: now,
  };

  const tradeOffers = state.tradeOffers.slice();
  tradeOffers[idx] = { ...original, status: "countered", updatedAt: now };
  const nextOffers = pruneTradeOffers(tradeOffers.concat(offer));
  return addEvent({ ...state, tradeOffers: nextOffers }, `${me.name} macht einen Gegenvorschlag.`);
}

function finishIfNeeded(state: GameState): GameState {
  if (state.round <= state.maxRounds) return state;
  const best = state.players.slice().sort((a, b) => b.score - a.score)[0] ?? null;
  return addEvent(
    {
      ...state,
      status: "finished",
      winnerPlayerId: best?.id ?? null,
      phase: "await_roll" as const,
      lastDiceRoll: null,
    },
    `Spiel beendet. Gewinner: ${best?.name ?? "—"}.`,
  );
}

export function endTurn(state: GameState, playerId: string): GameState {
  if (state.status !== "playing" || state.winnerPlayerId) return state;
  if (!isMyTurn(state, playerId)) return state;
  if (state.phase === "wormhole") return state;

  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const roundEnded = nextPlayerIndex === 0;
  const now = Date.now();
  const tradeOffers = state.tradeOffers.map((o) => (o.status === "open" ? { ...o, status: "expired" as const, updatedAt: now } : o));

  let next: GameState = {
    ...state,
    currentPlayerIndex: nextPlayerIndex,
    phase: "await_roll" as const,
    lastDiceRoll: null,
    roundStartedAt: roundEnded ? Date.now() : state.roundStartedAt,
    turnStartedAt: Date.now(),
    tradeOffers,
  };

  if (roundEnded) {
    const rotated = rotateOuterRing(next.board, { steps: 1 });
    next = { ...next, board: rotated.board, round: next.round + 1 };
    if (rotated.tileIdMap.size && rotated.tileIdMap.has(next.blackHoleTileId)) {
      next = { ...next, blackHoleTileId: rotated.tileIdMap.get(next.blackHoleTileId)! };
    }
    next = addEvent(next, `Runde ${next.round} startet. Äußerer Ring rotiert.`);
  }

  return finishIfNeeded(next);
}

export function botAct(state: GameState): GameState {
  if ((state.status !== "playing" && !isSetupStatus(state.status)) || state.winnerPlayerId) return state;
  const p = currentPlayer(state);
  if (!p?.isBot) return state;

  let next = state;

  if (isSetupStatus(next.status) && next.setup) {
    if (next.setup.required === "station") {
      const myEdges = next.hyperlanes
        .filter((h) => h.playerId === p.id)
        .map((h) => edgeById(next).get(h.edgeId))
        .filter(Boolean) as BoardEdge[];
      const connectedVertices = new Set<VertexId>();
      for (const e of myEdges) {
        connectedVertices.add(e.a);
        connectedVertices.add(e.b);
      }

      const anyOpenVertices = next.board.vertices
        .map((v) => v.id)
        .filter((vid) => !next.stations.some((s) => s.vertexId === vid));

      const connectedOpenVertices = Array.from(connectedVertices).filter(
        (vid) => !next.stations.some((s) => s.vertexId === vid),
      );

      const primary = connectedOpenVertices.slice();
      for (let i = primary.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = primary[i]!;
        primary[i] = primary[j]!;
        primary[j] = tmp;
      }
      for (const vid of primary.slice(0, 60)) {
        const attempt = buildStation(next, p.id, vid);
        if (attempt !== next) return attempt;
      }

      const fallback = anyOpenVertices.slice();
      for (let i = fallback.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = fallback[i]!;
        fallback[i] = fallback[j]!;
        fallback[j] = tmp;
      }
      for (const vid of fallback.slice(0, 120)) {
        const attempt = buildStation(next, p.id, vid);
        if (attempt !== next) return attempt;
      }
    }

    if (next.setup.required === "hyperlane") {
      const myStationVertices = next.stations.filter((s) => s.playerId === p.id).map((s) => s.vertexId);
      const edges = next.board.edges.filter((e) => myStationVertices.includes(e.a) || myStationVertices.includes(e.b));
      const candidates = edges
        .map((e) => e.id)
        .filter((eid) => !next.hyperlanes.some((h) => h.edgeId === eid));
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = candidates[i]!;
        candidates[i] = candidates[j]!;
        candidates[j] = tmp;
      }

      for (const eid of candidates.slice(0, 60)) {
        const attempt = buildHyperlane(next, p.id, eid);
        if (attempt !== next) return attempt;
      }
    }

    return next;
  }

  const diceWeight: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  const biomeResource: Partial<Record<Biome, Resource>> = {
    nebula: "gas",
    asteroid: "metal",
    frozen: "crystal",
    farm: "food",
    ruins: "data",
  };

  const vertexTiles = new Map<VertexId, { biome: Biome; numberToken: number | null; tileId: TileId }[]>();
  for (const t of next.board.tiles) {
    for (const vid of t.cornerVertexIds) {
      const list = vertexTiles.get(vid) ?? [];
      list.push({ biome: t.biome, numberToken: t.numberToken, tileId: t.id });
      vertexTiles.set(vid, list);
    }
  }

  const neighborsByVertex = new Map<VertexId, VertexId[]>();
  for (const e of next.board.edges) {
    const aList = neighborsByVertex.get(e.a) ?? [];
    aList.push(e.b);
    neighborsByVertex.set(e.a, aList);
    const bList = neighborsByVertex.get(e.b) ?? [];
    bList.push(e.a);
    neighborsByVertex.set(e.b, bList);
  }

  const myHasAnything =
    next.stations.some((s) => s.playerId === p.id) ||
    next.hyperlanes.some((h) => h.playerId === p.id) ||
    next.warpLanes.some((w) => w.playerId === p.id);

  const myConnectedVertices = () => {
    const set = new Set<VertexId>();
    for (const s of next.stations) if (s.playerId === p.id) set.add(s.vertexId);
    for (const h of next.hyperlanes) {
      if (h.playerId !== p.id) continue;
      const e = edgeById(next).get(h.edgeId);
      if (!e) continue;
      set.add(e.a);
      set.add(e.b);
    }
    return set;
  };

  const violatesDistance = (vertexId: VertexId) => {
    if (next.stations.some((s) => s.vertexId === vertexId)) return true;
    for (const s of next.stations) {
      const neigh = neighborsByVertex.get(s.vertexId) ?? [];
      if (neigh.includes(vertexId)) return true;
    }
    return false;
  };

  const vertexValue = (vertexId: VertexId) => {
    const tiles = vertexTiles.get(vertexId) ?? [];
    let v = 0;
    for (const t of tiles) {
      if (!t.numberToken) continue;
      if (t.tileId === next.blackHoleTileId) continue;
      if (t.biome === "singularity") continue;
      v += (diceWeight[t.numberToken] ?? 0);
    }
    return v;
  };

  if (next.phase === "await_roll") {
    const rolled = handleRoll(next, p.id);
    return rolled.state;
  }

  if (next.phase === "wormhole") {
    const candidates = next.board.tiles.filter((t) => t.biome !== "singularity");
    let best: { id: TileId; score: number } | null = null;
    for (const t of candidates) {
      let own = 0;
      let opp = 0;
      for (const vid of t.cornerVertexIds) {
        const st = next.stations.find((s) => s.vertexId === vid);
        if (!st) continue;
        if (st.playerId === p.id) own += st.level === "starbase" ? 2 : 1;
        else opp += st.level === "starbase" ? 2 : 1;
      }
      const score = opp - own;
      if (!best || score > best.score) best = { id: t.id, score };
    }
    return resolveWormhole(next, p.id, { newBlackHoleTileId: best?.id ?? next.blackHoleTileId });
  }

  if (next.phase === "main") {
    const upgradeCandidates = next.stations
      .filter((s) => s.playerId === p.id && s.level === "station")
      .map((s) => s.vertexId);
    let bestUpgrade: { vid: VertexId; value: number } | null = null;
    for (const vid of upgradeCandidates) {
      const tiles = vertexTiles.get(vid) ?? [];
      let expectedExtra = 0;
      for (const t of tiles) {
        if (!t.numberToken) continue;
        if (t.tileId === next.blackHoleTileId) continue;
        if (t.biome === "singularity") continue;
        expectedExtra += (diceWeight[t.numberToken] ?? 0);
      }
      if (!bestUpgrade || expectedExtra > bestUpgrade.value) bestUpgrade = { vid, value: expectedExtra };
    }
    if (bestUpgrade) {
      const attempt = upgradeToStarbase(next, p.id, bestUpgrade.vid);
      if (attempt !== next) return attempt;
    }

    const connected = myHasAnything ? myConnectedVertices() : new Set<VertexId>();
    const stationCandidates = next.board.vertices
      .map((v) => v.id)
      .filter((vid) => !next.stations.some((s) => s.vertexId === vid))
      .filter((vid) => !violatesDistance(vid))
      .filter((vid) => !myHasAnything || connected.has(vid));
    let bestStation: { vid: VertexId; value: number } | null = null;
    for (const vid of stationCandidates) {
      const value = vertexValue(vid);
      if (!bestStation || value > bestStation.value) bestStation = { vid, value };
    }
    if (bestStation) {
      const attempt = buildStation(next, p.id, bestStation.vid);
      if (attempt !== next) return attempt;
    }

    const hyperlaneCandidates = next.board.edges
      .filter((e) => !next.hyperlanes.some((h) => h.edgeId === e.id))
      .filter((e) => !myHasAnything || hasConnectionToEdge(next, p.id, e));
    let bestEdge: { edgeId: EdgeId; value: number } | null = null;
    for (const e of hyperlaneCandidates) {
      const a = vertexValue(e.a);
      const b = vertexValue(e.b);
      const value = Math.max(a, b);
      if (!bestEdge || value > bestEdge.value) bestEdge = { edgeId: e.id, value };
    }
    if (bestEdge) {
      const attempt = buildHyperlane(next, p.id, bestEdge.edgeId);
      if (attempt !== next) return attempt;
    }

    const me = next.players.find((x) => x.id === p.id);
    if (me) {
      const wants: Array<{ cost: Partial<Record<Resource, number>>; receive: Resource }> = [
        { cost: { metal: 1, gas: 1, food: 1, crystal: 1 }, receive: "metal" },
        { cost: { metal: 1, gas: 1, food: 1, crystal: 1 }, receive: "gas" },
        { cost: { metal: 1, gas: 1, food: 1, crystal: 1 }, receive: "food" },
        { cost: { metal: 1, gas: 1, food: 1, crystal: 1 }, receive: "crystal" },
        { cost: { metal: 1, gas: 1 }, receive: "metal" },
        { cost: { metal: 1, gas: 1 }, receive: "gas" },
        { cost: { data: 3, crystal: 2 }, receive: "data" },
        { cost: { data: 3, crystal: 2 }, receive: "crystal" },
      ];

      for (const w of wants) {
        const need = w.cost[w.receive] ?? 0;
        if (need <= 0) continue;
        if ((me.resources[w.receive] ?? 0) >= need) continue;

        const rate = getBlackHoleRate(next.blackHolePool, w.receive);
        if (!rate) continue;
        const give = (Object.keys(me.resources) as Resource[])
          .filter((r) => r !== w.receive)
          .filter((r) => (me.resources[r] ?? 0) >= rate)
          .sort((a, b) => (me.resources[b] ?? 0) - (me.resources[a] ?? 0))[0];
        if (give) {
          const attempt = tradeBlackMarket(next, p.id, { give, receive: w.receive });
          if (attempt !== next) return attempt;
        }
      }
    }

    return endTurn(next, p.id);
  }

  return next;
}
