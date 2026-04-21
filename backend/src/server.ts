import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { Router } from "express";
import { registerGameRoutes } from "./api/games";
import { registerAuthRoutes } from "./api/auth";
import { registerFriendRoutes } from "./api/friends";
import { getGame, getAllGames, updateGameState, removeGame } from "./game/registry";
import { botAct, buildHyperlane, buildStation, buildWarpLane, endTurn, handleRoll, resolveWormhole, startGame, tradeBlackMarket, upgradeToStarbase } from "./game/engine";
import type { ChatMessage, DiceRoll, GameState, Player, PlayerColor, Resource, TileId } from "./game/types";
import { randomUUID } from "node:crypto";
import { verifyUserToken } from "./auth/jwt";
import { getUserById } from "./auth/store";

import path from "path";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../.env"),
];
if (process.env.NODE_ENV !== "production") {
  for (const p of envCandidates) {
    dotenv.config({ path: p });
  }
}

const playerColors: PlayerColor[] = ["red", "blue", "green", "yellow"];

const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const extraOrigins = (process.env.CLIENT_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = new Set<string>([
  CLIENT_ORIGIN,
  ...extraOrigins,
  "http://localhost:5173",
  "http://localhost:5174",
]);

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (process.env.NODE_ENV !== "production") {
        if (origin.startsWith("http://localhost:")) return cb(null, true);
        if (origin.startsWith("http://127.0.0.1:")) return cb(null, true);
      }
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

const apiRouter = Router();
registerAuthRoutes(apiRouter);
registerGameRoutes(apiRouter);
registerFriendRoutes(apiRouter);
app.use("/api", apiRouter);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.GITHUB_SHA ??
      process.env.COMMIT_SHA ??
      null,
    deployedAt:
      process.env.RAILWAY_DEPLOYMENT_CREATED_AT ??
      process.env.RAILWAY_DEPLOYMENT_ID ??
      null,
    smtpConfigured: Boolean(
      process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        (process.env.EMAIL_FROM ?? process.env.SMTP_FROM),
    ),
    emailTransport: process.env.EMAIL_TRANSPORT ?? null,
    resendConfigured: Boolean(process.env.RESEND_API_KEY && (process.env.EMAIL_FROM ?? process.env.SMTP_FROM)),
    appBaseUrl: process.env.APP_BASE_URL ?? null,
  });
});

// Serve static frontend files in production
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDistPath));

// Fallback for SPA routing
app.get(/^(?!\/(api|socket\.io)).*/, (req, res) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

const TURN_TIMEOUT_MS = 45000;
const INACTIVE_TURN_TIMEOUT_LIMIT = 10;
const GAME_INACTIVE_TIMEOUT_MS = 3600000;

type GameActivityMeta = {
  lastHumanActionAt: number;
  consecutiveTurnTimeouts: number;
};

const activityByGameId = new Map<string, GameActivityMeta>();
const socketsByGameId = new Map<string, Set<string>>();
const endingGames = new Set<string>();

function ensureActivity(gameId: string, fallbackTimestamp: number) {
  const existing = activityByGameId.get(gameId);
  if (existing) return existing;
  const created: GameActivityMeta = {
    lastHumanActionAt: fallbackTimestamp,
    consecutiveTurnTimeouts: 0,
  };
  activityByGameId.set(gameId, created);
  return created;
}

function markHumanActivity(gameId: string) {
  const meta = ensureActivity(gameId, Date.now());
  meta.lastHumanActionAt = Date.now();
  meta.consecutiveTurnTimeouts = 0;
}

function markTurnTimeout(gameId: string) {
  const meta = ensureActivity(gameId, Date.now());
  meta.consecutiveTurnTimeouts += 1;
  return meta.consecutiveTurnTimeouts;
}

function endGame(gameId: string, reason: "inactive_turns" | "inactive_time" | "empty") {
  if (endingGames.has(gameId)) return;
  endingGames.add(gameId);

  const game = getGame(gameId);
  if (game) {
    const finalState: GameState = {
      ...game.state,
      status: "finished",
      winnerPlayerId: null,
      lastDiceRoll: null,
      phase: "await_roll",
      setup: null,
      roundStartedAt: game.state.roundStartedAt ?? Date.now(),
      turnStartedAt: Date.now(),
    };
    updateGameState(gameId, finalState);
    io.to(gameId).emit("game_ended", { reason });
    io.to(gameId).emit("game_state", { state: finalState });
  } else {
    io.to(gameId).emit("game_ended", { reason });
  }

  io.in(gameId).disconnectSockets(true);
  removeGame(gameId);
  activityByGameId.delete(gameId);
  socketsByGameId.delete(gameId);

  setTimeout(() => {
    endingGames.delete(gameId);
  }, 60_000);
}

const profanityWords = [
  "arsch",
  "arschloch",
  "bastard",
  "bitch",
  "cunt",
  "drecks",
  "dummkopf",
  "fick",
  "ficken",
  "fuck",
  "hurensohn",
  "idiot",
  "motherfucker",
  "scheisse",
  "scheiße",
  "shit",
  "spast",
  "wixer",
];

function containsProfanity(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
  if (!normalized) return false;
  return profanityWords.some((w) => normalized.includes(w));
}

// Background task to check for turn timeouts and clean up old games
setInterval(() => {
  const games = getAllGames();
  const now = Date.now();

  for (const game of games) {
    if (endingGames.has(game.id)) continue;

    const activity = ensureActivity(game.id, game.state.turnStartedAt);

    // 1. Handle Turn Timeout
    if (game.state.status === "playing" && !game.state.winnerPlayerId) {
      const timeSinceStart = now - game.state.turnStartedAt;
      if (timeSinceStart >= TURN_TIMEOUT_MS) {
        const timedOutPlayerId = game.state.players[game.state.currentPlayerIndex]?.id;
        if (timedOutPlayerId) {
          let newState = game.state;
          if (newState.phase === "wormhole") {
            const candidates = newState.board.tiles.filter((t) => t.biome !== "singularity");
            const chosen = candidates[Math.floor(Math.random() * candidates.length)]?.id ?? newState.blackHoleTileId;
            newState = resolveWormhole(newState, timedOutPlayerId, { newBlackHoleTileId: chosen as TileId });
          }
          newState = endTurn(newState, timedOutPlayerId);
          updateGameState(game.id, newState);
          io.to(game.id).emit("game_state", { state: newState });
          io.to(game.id).emit("turn_timeout", { playerId: timedOutPlayerId });
          newState = runBotsUntilHuman(game.id, newState);
        }

        const consecutiveTimeouts = markTurnTimeout(game.id);
        if (consecutiveTimeouts >= INACTIVE_TURN_TIMEOUT_LIMIT) {
          endGame(game.id, "inactive_turns");
          continue;
        }
      }
    }

    // 2. Clean up inactive/finished games
    const timeSinceHumanActivity = now - activity.lastHumanActionAt;
    if (timeSinceHumanActivity >= GAME_INACTIVE_TIMEOUT_MS) {
      endGame(game.id, "inactive_time");
      continue;
    }
  }
}, 1000);

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

interface SocketMeta {
  gameId?: string;
  playerId?: string;
  playerName?: string;
}

const socketMeta = new Map<string, SocketMeta>();

const botRunnerByGameId = new Map<string, ReturnType<typeof setTimeout>>();

function clearBotRunner(gameId: string) {
  const t = botRunnerByGameId.get(gameId);
  if (t) clearTimeout(t);
  botRunnerByGameId.delete(gameId);
}

function runBotsUntilHuman(gameId: string, initialState: GameState) {
  if (botRunnerByGameId.has(gameId)) return initialState;

  const step = () => {
    const game = getGame(gameId);
    if (!game) return clearBotRunner(gameId);

    const state = game.state;
    if ((state.status !== "playing" && state.status !== "setup_phase_1" && state.status !== "setup_phase_2") || state.winnerPlayerId) {
      return clearBotRunner(gameId);
    }

    const cp = state.players[state.currentPlayerIndex];
    if (!cp?.isBot) return clearBotRunner(gameId);

    const prev = state;
    const next = botAct(prev);
    if (next === prev) return clearBotRunner(gameId);

    updateGameState(gameId, next);
    if (
      next.lastDiceRoll &&
      (!prev.lastDiceRoll ||
        prev.lastDiceRoll.d1 !== next.lastDiceRoll.d1 ||
        prev.lastDiceRoll.d2 !== next.lastDiceRoll.d2)
    ) {
      io.to(gameId).emit("dice_rolled", { playerId: cp.id, roll: next.lastDiceRoll });
    }
    io.to(gameId).emit("game_state", { state: next });

    const t = setTimeout(step, 1000);
    botRunnerByGameId.set(gameId, t);
  };

  const t = setTimeout(step, 1000);
  botRunnerByGameId.set(gameId, t);
  return initialState;
}

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);

  socket.on("join_game", async (payload: { gameId: string; token: string; avatarUrl?: string }) => {
    const { gameId, token, avatarUrl } = payload;
    const game = getGame(gameId);
    if (!game) {
      socket.emit("error_message", { message: "Game not found." });
      return;
    }

    let authedUserId: string | null = null;
    let authedUserName: string | null = null;
    try {
      const claims = verifyUserToken(token);
      const user = await getUserById(claims.sub);
      if (!user || !user.emailVerifiedAt) {
        socket.emit("error_message", { message: "Unauthorized." });
        return;
      }
      authedUserId = user.id;
      authedUserName = user.name;
    } catch {
      socket.emit("error_message", { message: "Unauthorized." });
      return;
    }

    markHumanActivity(gameId);

    // Check if player is already in the game
    let player = game.state.players.find(p => p.id === authedUserId);
    
    // If not, and there's space, add them
    if (!player && game.state.players.length < 4) {
      const newPlayer: Player = {
        id: authedUserId,
        name: authedUserName,
        color: playerColors[game.state.players.length]!,
        avatarUrl: avatarUrl,
        isBot: false,
        score: 0,
        resources: { metal: 0, gas: 0, crystal: 0, food: 0, data: 0 },
      };
      game.state.players.push(newPlayer);
    }

    socket.join(gameId);
    socketMeta.set(socket.id, { gameId, playerId: authedUserId, playerName: authedUserName });
    const sockets = socketsByGameId.get(gameId) ?? new Set<string>();
    sockets.add(socket.id);
    socketsByGameId.set(gameId, sockets);

    // Notify everyone in the room about the new state
    io.to(gameId).emit("game_state", { state: game.state });
  });

  socket.on("start_game", (payload: { gameId: string }) => {
    const { gameId } = payload;
    const game = getGame(gameId);
    if (!game) {
      return socket.emit("error_message", { message: "Game not found." });
    }
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;
    if (game.state.creatorId !== meta.playerId) {
      return socket.emit("error_message", { message: "Only the creator can start the game." });
    }
    if (game.state.players.length < 2) {
      return socket.emit("error_message", { message: "Need at least 2 players to start." });
    }

    markHumanActivity(gameId);
    const newState = startGame(game.state);
    updateGameState(gameId, newState);
    io.to(gameId).emit("game_state", { state: newState });
    runBotsUntilHuman(gameId, newState);
  });

  socket.on("roll_dice", (payload: { gameId: string }) => {
    const { gameId } = payload;
    const game = getGame(gameId);
    if (!game) {
      socket.emit("error_message", { message: "Game not found." });
      return;
    }
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;

    markHumanActivity(gameId);
    const rolled = handleRoll(game.state, meta.playerId);
    const newState = rolled.state;
    updateGameState(gameId, newState);

    const dice: DiceRoll | null = newState.lastDiceRoll;
    io.to(gameId).emit("dice_rolled", { playerId: meta.playerId, roll: dice });
    io.to(gameId).emit("game_state", { state: newState });
    runBotsUntilHuman(gameId, newState);
  });

  socket.on("resolve_wormhole", (payload: { gameId: string; newBlackHoleTileId: TileId; moves?: Array<{ fromEdgeId: string; toEdgeId: string }> }) => {
    const { gameId } = payload;
    const game = getGame(gameId);
    if (!game) return;
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;

    markHumanActivity(gameId);
    const wormholeParams = payload.moves
      ? { newBlackHoleTileId: payload.newBlackHoleTileId, moves: payload.moves }
      : { newBlackHoleTileId: payload.newBlackHoleTileId };
    const newState = resolveWormhole(game.state, meta.playerId, wormholeParams);
    updateGameState(gameId, newState);
    io.to(gameId).emit("game_state", { state: newState });
    runBotsUntilHuman(gameId, newState);
  });

  socket.on("build_station", (payload: { gameId: string; vertexId: string }) => {
    const { gameId, vertexId } = payload;
    const game = getGame(gameId);
    if (!game) return;
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;
    markHumanActivity(gameId);
    const newState = buildStation(game.state, meta.playerId, vertexId);
    updateGameState(gameId, newState);
    io.to(gameId).emit("game_state", { state: newState });
    runBotsUntilHuman(gameId, newState);
  });

  socket.on("upgrade_starbase", (payload: { gameId: string; vertexId: string }) => {
    const { gameId, vertexId } = payload;
    const game = getGame(gameId);
    if (!game) return;
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;
    markHumanActivity(gameId);
    const newState = upgradeToStarbase(game.state, meta.playerId, vertexId);
    updateGameState(gameId, newState);
    io.to(gameId).emit("game_state", { state: newState });
    runBotsUntilHuman(gameId, newState);
  });

  socket.on("build_hyperlane", (payload: { gameId: string; edgeId: string }) => {
    const { gameId, edgeId } = payload;
    const game = getGame(gameId);
    if (!game) return;
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;
    markHumanActivity(gameId);
    const newState = buildHyperlane(game.state, meta.playerId, edgeId);
    updateGameState(gameId, newState);
    io.to(gameId).emit("game_state", { state: newState });
    runBotsUntilHuman(gameId, newState);
  });

  socket.on("build_warp_lane", (payload: { gameId: string; fromVertexId: string; toVertexId: string }) => {
    const { gameId, fromVertexId, toVertexId } = payload;
    const game = getGame(gameId);
    if (!game) return;
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;
    markHumanActivity(gameId);
    const newState = buildWarpLane(game.state, meta.playerId, { fromVertexId, toVertexId });
    updateGameState(gameId, newState);
    io.to(gameId).emit("game_state", { state: newState });
    runBotsUntilHuman(gameId, newState);
  });

  socket.on("end_turn", (payload: { gameId: string }) => {
    const { gameId } = payload;
    const game = getGame(gameId);
    if (!game) return;
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;
    markHumanActivity(gameId);
    const newState = endTurn(game.state, meta.playerId);
    updateGameState(gameId, newState);
    io.to(gameId).emit("game_state", { state: newState });
    runBotsUntilHuman(gameId, newState);
  });

  socket.on("black_market_trade", (payload: { gameId: string; give: Resource; receive: Resource }) => {
    const { gameId, give, receive } = payload;
    const game = getGame(gameId);
    if (!game) return;
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;
    markHumanActivity(gameId);
    const newState = tradeBlackMarket(game.state, meta.playerId, { give, receive });
    updateGameState(gameId, newState);
    io.to(gameId).emit("game_state", { state: newState });
    runBotsUntilHuman(gameId, newState);
  });

  socket.on("send_chat_message", (payload: { gameId: string; text: string }) => {
    const { gameId, text } = payload;
    const game = getGame(gameId);
    if (!game) return;
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId || meta.gameId !== gameId) return;

    const player = game.state.players.find(p => p.id === meta.playerId);
    if (!player) return;

    markHumanActivity(gameId);
    if (containsProfanity(text)) {
      socket.emit("error_message", { message: "Chatnachricht enthält unzulässige Wörter." });
      return;
    }

    // Security: Truncate message
    const sanitizedText = text.substring(0, 200);

    const newMessage: ChatMessage = {
      id: randomUUID(),
      playerId: meta.playerId,
      playerName: player.name,
      text: sanitizedText,
      timestamp: Date.now(),
    };

    game.state.chatMessages.push(newMessage);
    // Limit to last 50 messages
    if (game.state.chatMessages.length > 50) {
      game.state.chatMessages.shift();
    }

    io.to(gameId).emit("chat_message", newMessage);
    io.to(gameId).emit("game_state", { state: game.state });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
    const meta = socketMeta.get(socket.id);
    socketMeta.delete(socket.id);

    const gameId = meta?.gameId;
    if (!gameId) return;

    const sockets = socketsByGameId.get(gameId);
    if (!sockets) return;

    sockets.delete(socket.id);
    if (sockets.size === 0) {
      endGame(gameId, "empty");
      return;
    }

    const connectedPlayerIds = new Set<string>();
    for (const sid of sockets) {
      const m = socketMeta.get(sid);
      if (m?.gameId === gameId && m.playerId) connectedPlayerIds.add(m.playerId);
    }

    if (connectedPlayerIds.size <= 1) {
      endGame(gameId, "empty");
      return;
    }

    socketsByGameId.set(gameId, sockets);
  });
});

httpServer.listen(Number(PORT), HOST, () => {
  console.log(`Backend listening on http://${HOST}:${PORT}`);
});

async function shutdown(signal: string) {
  console.log(`Shutting down (${signal})...`);
  try {
    io.close();
  } catch {}
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
