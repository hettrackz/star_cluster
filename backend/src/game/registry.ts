import type { GameState } from "./types";
import { createInitialGame } from "./engine";

export interface GameInstance {
  id: string;
  state: GameState;
}

const games = new Map<string, GameInstance>();

export function getAllGames(): GameInstance[] {
  return Array.from(games.values());
}

export function createGame(
  creatorId: string,
  creatorName: string,
  avatarUrl?: string,
  params?: { radius?: number; maxRounds?: number; botCount?: number; turnLimitSec?: number },
): GameInstance {
  const state = createInitialGame(creatorId, creatorName, avatarUrl, params);
  const instance: GameInstance = { id: state.id, state };
  games.set(instance.id, instance);
  return instance;
}

export function getGame(id: string): GameInstance | undefined {
  return games.get(id);
}

export function updateGameState(id: string, newState: GameState): void {
  const game = games.get(id);
  if (!game) return;
  game.state = newState;
}

export function removeGame(id: string): void {
  games.delete(id);
}
