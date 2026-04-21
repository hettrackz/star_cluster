import type { Router } from "express";
import { requireVerifiedAuth, type AuthedRequest } from "../auth/middleware";
import { addFriendByEmail, listFriends, normalizeEmail } from "../auth/store";
import { getAllGames } from "../game/registry";

function userPublic(u: { id: string; email: string; name: string; avatarUrl?: string | undefined }) {
  return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl ?? null };
}

export function registerFriendRoutes(router: Router) {
  router.get("/friends", requireVerifiedAuth, async (req: AuthedRequest, res) => {
    try {
      const friends = await listFriends({ userId: req.user!.id });
      return res.json({ friends: friends.map(userPublic) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: msg });
    }
  });

  router.post("/friends", requireVerifiedAuth, async (req: AuthedRequest, res) => {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: "Missing fields" });
    const friendEmail = normalizeEmail(email);
    try {
      const friend = await addFriendByEmail({ userId: req.user!.id, friendEmail });
      return res.status(201).json({ friend: userPublic(friend) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "FRIEND_NOT_FOUND") return res.status(404).json({ error: "User not found" });
      if (msg === "CANNOT_FRIEND_SELF") return res.status(400).json({ error: "Cannot add yourself" });
      if (msg === "USER_NOT_FOUND") return res.status(401).json({ error: "Unauthorized" });
      return res.status(500).json({ error: msg });
    }
  });

  router.get("/friends/open-games", requireVerifiedAuth, async (req: AuthedRequest, res) => {
    try {
      const friends = await listFriends({ userId: req.user!.id });
      const friendById = new Map(friends.map((f) => [f.id, f]));

      const items = getAllGames()
        .filter((g) => g.state.status === "lobby")
        .filter((g) => g.state.players.some((p) => friendById.has(p.id)))
        .map((g) => {
          const friendPlayer = g.state.players.find((p) => friendById.has(p.id));
          const friend = friendPlayer ? friendById.get(friendPlayer.id)! : friends[0]!;
          return {
            gameId: g.id,
            status: g.state.status,
            turnStartedAt: g.state.turnStartedAt,
            friend: userPublic(friend),
            players: g.state.players.map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color,
              avatarUrl: p.avatarUrl ?? null,
            })),
          };
        })
        .sort((a, b) => b.turnStartedAt - a.turnStartedAt);

      return res.json({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: msg });
    }
  });
}

