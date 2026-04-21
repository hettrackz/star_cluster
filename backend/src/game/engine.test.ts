import { describe, it, expect } from "vitest";
import { botAct, buildHyperlane, buildStation, createInitialGame, handleRoll, startGame } from "./engine";

describe("Star Cluster Engine", () => {
  it("erstellt ein neues Spiel mit Board und optionalen Bots", () => {
    const game = createInitialGame("p1", "Alice", undefined, { radius: 3, maxRounds: 10, botCount: 3 });
    expect(game.players).toHaveLength(4);
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
    game = startGame(game);
    expect(game.status).toBe("setup_phase_1");
    expect(game.setup?.required).toBe("station");
    expect(game.currentPlayerIndex).toBe(0);

    const v = game.board.vertices[0]!.id;
    game = buildStation(game, "p1", v);
    expect(game.setup?.required).toBe("hyperlane");

    const e = game.board.edges.find((ed) => ed.a === v || ed.b === v)!.id;
    game = buildHyperlane(game, "p1", e);

    expect(game.status).toBe("setup_phase_1");
    expect(game.currentPlayerIndex).toBe(1);
    expect(game.setup?.required).toBe("station");
  });

  it("wechselt von Setup Phase 1 nach Setup Phase 2 (N→1) und startet danach das Hauptspiel", () => {
    let game = createInitialGame("p1", "Alice", undefined, { botCount: 3 });
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
});
