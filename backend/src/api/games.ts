import type { Router } from "express";
import { createGame, getGame } from "../game/registry";
import { requireVerifiedAuth, type AuthedRequest } from "../auth/middleware";

export function registerGameRoutes(router: Router) {
  router.post("/games", requireVerifiedAuth, (req: AuthedRequest, res) => {
    const { creatorName, avatarUrl, radius, maxRounds, botCount, turnLimitSec } = req.body as {
      creatorName?: string;
      avatarUrl?: string;
      radius?: number;
      maxRounds?: number;
      botCount?: number;
      turnLimitSec?: number;
    };
    const creatorId = req.user!.id;
    const name = creatorName?.trim() || req.user!.name;

    try {
      const params: { radius?: number; maxRounds?: number; botCount?: number; turnLimitSec?: number } = {};
      if (typeof radius === "number") params.radius = radius;
      if (typeof maxRounds === "number") params.maxRounds = maxRounds;
      if (typeof botCount === "number") params.botCount = botCount;
      if (typeof turnLimitSec === "number") params.turnLimitSec = turnLimitSec;
      const game = createGame(creatorId, name, avatarUrl, Object.keys(params).length ? params : undefined);
      return res.status(201).json({ gameId: game.id, state: game.state });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Could not create game." });
    }
  });

  router.get("/games/:id", requireVerifiedAuth, (req, res) => {
    const game = getGame(String(req.params.id));
    if (!game) {
      return res.status(404).json({ error: "Game not found." });
    }
    return res.json({ gameId: game.id, state: game.state });
  });
}
