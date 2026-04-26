import { describe, it, expect } from "vitest";
import {
  acceptTradeOffer,
  botAct,
  declineTradeOffer,
  counterTradeOffer,
  createInitialGame,
  createTradeOffer,
  endTurn,
  expireTradeOffers,
  handleRoll,
  startGame,
  buildHyperlane,
  buildStation,
} from "./engine";
import type { Player } from "./types";

function addBot(game: ReturnType<typeof createInitialGame>, botId: string) {
  const bot: Player = {
    id: botId,
    name: botId,
    color: "blue",
    avatarUrl: undefined,
    isBot: true,
    isReady: true,
    score: 0,
    resources: { metal: 0, gas: 0, crystal: 0, food: 0, data: 0 },
  };
  return { ...game, players: game.players.concat(bot) };
}

describe("Star Cluster Engine", () => {
  it("erstellt ein neues Spiel mit Board und optionalen Bots", () => {
    const game = createInitialGame("p1", "Alice", undefined, { radius: 3, maxRounds: 10, botCount: 3 });
    expect(game.players).toHaveLength(1);
    expect(game.maxBots).toBe(3);
    expect(game.board.tiles.length).toBeGreaterThan(0);
    expect(game.board.vertices.length).toBeGreaterThan(0);
    expect(game.board.edges.length).toBeGreaterThan(0);
    expect(game.blackHoleTileId).toBeTruthy();
  });

  it("würfelt 2W6 und setzt Phase korrekt", () => {
    let game = createInitialGame("p1", "Alice", undefined, { botCount: 1 });
    game = { ...game, status: "playing", phase: "await_roll", setup: null };
    const res = handleRoll(game, "p1");
    expect(res.state.lastDiceRoll).not.toBeNull();
    expect(["main", "wormhole"]).toContain(res.state.phase);
  });

  it("läuft Setup Phase 1 in Reihenfolge 1→N (Station dann Hyperlane)", () => {
    let game = createInitialGame("p1", "Alice", undefined, { botCount: 1 });
    game = addBot(game, "bot:1");
    game = startGame(game);
    expect(game.status).toBe("setup_phase_1");
    expect(game.setup?.required).toBe("station");
    expect(game.currentPlayerIndex).toBe(0);

    const currentPlayerId = game.players[game.currentPlayerIndex]!.id;
    const v = game.board.vertices[0]!.id;
    game = buildStation(game, currentPlayerId, v);
    expect(game.setup?.required).toBe("hyperlane");

    const e = game.board.edges.find((ed) => ed.a === v || ed.b === v)!.id;
    game = buildHyperlane(game, currentPlayerId, e);

    expect(game.status).toBe("setup_phase_1");
    expect(game.currentPlayerIndex).toBe(1);
    expect(game.setup?.required).toBe("station");
  });

  it("wechselt von Setup Phase 1 nach Setup Phase 2 (N→1) und startet danach das Hauptspiel", () => {
    let game = createInitialGame("p1", "Alice", undefined, { botCount: 3 });
    game = addBot(game, "bot:1");
    game = addBot(game, "bot:2");
    game = addBot(game, "bot:3");
    game = startGame(game);

    for (let idx = 0; idx < game.players.length; idx++) {
      const pid = game.players[idx]!.id;
      let placed = false;
      for (const v of game.board.vertices) {
        const attempt = buildStation(game, pid, v.id);
        if (attempt !== game) {
          game = attempt;
          placed = true;
          break;
        }
      }
      expect(placed).toBe(true);

      const myStationVertices = game.stations.filter((s) => s.playerId === pid).map((s) => s.vertexId);
      let lanePlaced = false;
      for (const e of game.board.edges) {
        if (!myStationVertices.includes(e.a) && !myStationVertices.includes(e.b)) continue;
        const attempt = buildHyperlane(game, pid, e.id);
        if (attempt !== game) {
          game = attempt;
          lanePlaced = true;
          break;
        }
      }
      expect(lanePlaced).toBe(true);
    }

    expect(game.status).toBe("setup_phase_2");
    expect(game.currentPlayerIndex).toBe(3);
    expect(game.setup?.required).toBe("station");

    for (let idx = game.players.length - 1; idx >= 0; idx--) {
      const pid = game.players[idx]!.id;
      let placed = false;
      for (const v of game.board.vertices) {
        const attempt = buildStation(game, pid, v.id);
        if (attempt !== game) {
          game = attempt;
          placed = true;
          break;
        }
      }
      expect(placed).toBe(true);

      const myVertices = game.stations.filter((s) => s.playerId === pid).map((s) => s.vertexId);
      let lanePlaced = false;
      for (const e of game.board.edges) {
        if (!myVertices.includes(e.a) && !myVertices.includes(e.b)) continue;
        const attempt = buildHyperlane(game, pid, e.id);
        if (attempt !== game) {
          game = attempt;
          lanePlaced = true;
          break;
        }
      }
      expect(lanePlaced).toBe(true);
    }

    expect(game.status).toBe("playing");
    expect(game.currentPlayerIndex).toBe(0);
    expect(game.phase).toBe("await_roll");
    expect(game.setup).toBeNull();
  });

  it("Bot baut im Hauptspiel, wenn genug Ressourcen vorhanden sind", () => {
    let game = createInitialGame("p1", "Alice", undefined, { botCount: 1, radius: 3 });
    game = addBot(game, "bot:1");
    game = startGame(game);

    for (let idx = 0; idx < game.players.length; idx++) {
      const pid = game.players[idx]!.id;
      for (const v of game.board.vertices) {
        const attempt = buildStation(game, pid, v.id);
        if (attempt !== game) {
          game = attempt;
          break;
        }
      }
      for (const e of game.board.edges) {
        const attempt = buildHyperlane(game, pid, e.id);
        if (attempt !== game) {
          game = attempt;
          break;
        }
      }
    }

    for (let idx = game.players.length - 1; idx >= 0; idx--) {
      const pid = game.players[idx]!.id;
      for (const v of game.board.vertices) {
        const attempt = buildStation(game, pid, v.id);
        if (attempt !== game) {
          game = attempt;
          break;
        }
      }
      for (const e of game.board.edges) {
        const attempt = buildHyperlane(game, pid, e.id);
        if (attempt !== game) {
          game = attempt;
          break;
        }
      }
    }

    expect(game.status).toBe("playing");

    const botId = game.players.find((p) => p.isBot)!.id;
    game = {
      ...game,
      currentPlayerIndex: game.players.findIndex((p) => p.id === botId),
      phase: "main",
      players: game.players.map((p) =>
        p.id === botId
          ? { ...p, resources: { metal: 10, gas: 10, crystal: 10, food: 10, data: 10 } }
          : p,
      ),
    };

    const stationsBefore = game.stations.length;
    const botBefore = game.players.find((p) => p.id === botId)!.score;
    const next = botAct(game);

    const botAfter = next.players.find((p) => p.id === botId)!.score;
    expect(next).not.toBe(game);
    expect(next.stations.length >= stationsBefore || botAfter > botBefore).toBe(true);
  });

  it("verteilt Würfelzahlen pro Board möglichst gleichmäßig (Differenz max 1)", () => {
    const allowed = new Set([2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
    for (const radius of [2, 3, 4, 5, 6]) {
      const game = createInitialGame("p1", "Alice", undefined, { radius });
      const tokens = game.board.tiles.map((t) => t.numberToken).filter((x): x is number => x != null);
      expect(tokens.length).toBeGreaterThan(0);
      for (const t of tokens) expect(allowed.has(t)).toBe(true);

      const counts = new Map<number, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);

      const vals = Array.from(allowed.values()).map((n) => counts.get(n) ?? 0);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      expect(max - min).toBeLessThanOrEqual(1);
    }
  });

  it("erlaubt nur ein offenes Handelsangebot pro Spieler und setzt den Zähler bei Rundenwechsel zurück", () => {
    const p2: Player = {
      id: "p2",
      name: "Bob",
      color: "blue",
      avatarUrl: undefined,
      isBot: false,
      isReady: true,
      score: 0,
      resources: { metal: 0, gas: 10, crystal: 0, food: 0, data: 0 },
    };

    let game = createInitialGame("p1", "Alice");
    game = {
      ...game,
      status: "playing",
      phase: "main",
      setup: null,
      players: game.players
        .map((p) => (p.id === "p1" ? { ...p, resources: { metal: 10, gas: 0, crystal: 0, food: 0, data: 0 } } : p))
        .concat(p2),
      currentPlayerIndex: 0,
    };

    for (let i = 0; i < 5; i++) {
      game = createTradeOffer(game, "p1", { toPlayerId: "p2", give: { metal: 1 }, want: { gas: 1 } });
    }
    expect(game.tradeOffersThisRound["p1"]).toBe(1);
    expect(game.tradeOffers.filter((o) => o.status === "open")).toHaveLength(1);

    const before = game.tradeOffers.length;
    game = createTradeOffer(game, "p1", { toPlayerId: "p2", give: { metal: 1 }, want: { gas: 1 } });
    expect(game.tradeOffers.length).toBe(before);
    expect(game.tradeOffersThisRound["p1"]).toBe(1);

    game = endTurn(game, "p1");
    game = endTurn(game, "p2");
    expect(game.round).toBe(2);
    expect(Object.keys(game.tradeOffersThisRound)).toHaveLength(0);
  });

  it("erstattet den Handelsangebot-Zähler zurück, wenn das Angebot abläuft oder abgelehnt wird", () => {
    const p2: Player = {
      id: "p2",
      name: "Bob",
      color: "blue",
      avatarUrl: undefined,
      isBot: false,
      isReady: true,
      score: 0,
      resources: { metal: 0, gas: 10, crystal: 0, food: 0, data: 0 },
    };

    let game = createInitialGame("p1", "Alice");
    game = {
      ...game,
      status: "playing",
      phase: "main",
      setup: null,
      players: game.players
        .map((p) => (p.id === "p1" ? { ...p, resources: { metal: 10, gas: 0, crystal: 0, food: 0, data: 0 } } : p))
        .concat(p2),
      currentPlayerIndex: 0,
    };

    game = createTradeOffer(game, "p1", { toPlayerId: "p2", give: { metal: 1 }, want: { gas: 1 } });
    const offer = game.tradeOffers.find((o) => o.status === "open" && o.fromPlayerId === "p1")!;
    expect(game.tradeOffersThisRound["p1"]).toBe(1);

    game = expireTradeOffers(game, offer.createdAt + 20_001);
    expect(game.tradeOffers.find((o) => o.id === offer.id)?.status).toBe("expired");
    expect(game.tradeOffersThisRound["p1"]).toBeUndefined();

    game = createTradeOffer(game, "p1", { toPlayerId: "p2", give: { metal: 1 }, want: { gas: 1 } });
    const offer2 = game.tradeOffers.find((o) => o.status === "open" && o.fromPlayerId === "p1")!;
    expect(game.tradeOffersThisRound["p1"]).toBe(1);

    game = declineTradeOffer(game, "p2", { offerId: offer2.id });
    expect(game.tradeOffers.find((o) => o.id === offer2.id)?.status).toBe("declined");
    expect(game.tradeOffersThisRound["p1"]).toBeUndefined();
  });

  it("zählt nicht-mögliche Handelsangebote als Versuch", () => {
    const p2: Player = {
      id: "p2",
      name: "Bob",
      color: "blue",
      avatarUrl: undefined,
      isBot: false,
      isReady: true,
      score: 0,
      resources: { metal: 0, gas: 0, crystal: 0, food: 0, data: 0 },
    };

    let game = createInitialGame("p1", "Alice");
    game = {
      ...game,
      status: "playing",
      phase: "main",
      setup: null,
      players: game.players
        .map((p) => (p.id === "p1" ? { ...p, resources: { metal: 10, gas: 0, crystal: 0, food: 0, data: 0 } } : p))
        .concat(p2),
      currentPlayerIndex: 0,
    };

    game = createTradeOffer(game, "p1", { toPlayerId: null, give: { metal: 1 }, want: { gas: 1 } });
    expect(game.tradeOffers.filter((o) => o.status === "open")).toHaveLength(0);
    expect(game.tradeOffersThisRound["p1"]).toBe(1);
  });

  it("deaktiviert Gegenvorschläge", () => {
    const p2: Player = {
      id: "p2",
      name: "Bob",
      color: "blue",
      avatarUrl: undefined,
      isBot: false,
      isReady: true,
      score: 0,
      resources: { metal: 0, gas: 1, crystal: 0, food: 0, data: 0 },
    };

    let game = createInitialGame("p1", "Alice");
    game = {
      ...game,
      status: "playing",
      phase: "main",
      setup: null,
      players: game.players
        .map((p) => (p.id === "p1" ? { ...p, resources: { metal: 2, gas: 0, crystal: 0, food: 0, data: 0 } } : p))
        .concat(p2),
      currentPlayerIndex: 0,
    };

    game = createTradeOffer(game, "p1", { toPlayerId: "p2", give: { metal: 1 }, want: { gas: 1 } });
    const original = game.tradeOffers[game.tradeOffers.length - 1]!;

    const attempt = counterTradeOffer(game, "p2", { offerId: original.id, give: { gas: 1 }, want: { metal: 1 } });
    expect(attempt).toBe(game);
    expect(game.tradeOffers[game.tradeOffers.length - 1]!.id).toBe(original.id);
  });

  it("Bot kann Handelsangebote annehmen oder ablehnen", () => {
    const bot: Player = {
      id: "b1",
      name: "Bot",
      color: "green",
      avatarUrl: undefined,
      isBot: true,
      isReady: true,
      score: 0,
      resources: { metal: 0, gas: 1, crystal: 0, food: 0, data: 0 },
    };

    let game = createInitialGame("p1", "Alice");
    game = {
      ...game,
      status: "playing",
      phase: "main",
      setup: null,
      players: game.players
        .map((p) => (p.id === "p1" ? { ...p, resources: { metal: 1, gas: 0, crystal: 0, food: 0, data: 0 } } : p))
        .concat(bot),
      currentPlayerIndex: 1,
      tradeOffers: [
        {
          id: "o1",
          fromPlayerId: "p1",
          toPlayerId: "b1",
          give: { metal: 1 },
          want: { gas: 1 },
          status: "open",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    const next = botAct(game);
    expect(next).not.toBe(game);
    expect(next.tradeOffers.find((o) => o.id === "o1")?.status).toBe("accepted");
  });
});
