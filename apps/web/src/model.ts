import type { GameAction, PlayerGameView, Resource } from "@catan/engine";

type RemovePlayerId<T> = T extends { playerId: string } ? Omit<T, "playerId"> : never;

export type GameActionPayload = RemovePlayerId<GameAction>;

export interface RoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  isBot: boolean;
  isHost: boolean;
  isSelf: boolean;
  online: boolean;
}

export interface TurnStat {
  totalMs: number;
  turns: number;
  lastTurnMs: number;
}

export interface PauseRequest {
  mode: "pause" | "resume";
  requestedBy: string;
  votes: Record<string, boolean>;
  createdAt: number;
}

export interface LegalPlacements {
  settlementVertexIds: string[];
  roadIds: string[];
  freeRoadIds: string[];
  shipIds: string[];
  freeShipIds: string[];
  movableShipIds: string[];
  shipMoveTargets: Record<string, string[]>;
  pirateTargetHexIds: string[];
  cityVertexIds: string[];
  tradeRatios: Record<Resource, number>;
  robberHexIds: string[];
}

export interface RoomSnapshot {
  code: string;
  status: "lobby" | "playing" | "finished";
  hostPlayerId: string;
  selfPlayerId: string;
  players: RoomPlayer[];
  turnTimeLimitSeconds: number;
  turnDeadlineAt: number | null;
  tradeRespondDeadlineAt: number | null;
  pausedAt: number | null;
  pauseRemainingMs: number | null;
  pauseRequest: PauseRequest | null;
  turnStats: Record<string, TurnStat>;
  expansion: "base" | "seafarers";
  scenario: string | null;
  setupMode: "fixed" | "variable";
  game: PlayerGameView | null;
  legal: LegalPlacements;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  body: string;
  createdAt: number;
}

export interface GameEvent {
  id: string;
  actorId: string | null;
  actorName: string;
  kind: "system" | "action";
  message: string;
  createdAt: number;
}
