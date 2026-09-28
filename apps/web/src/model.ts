import type { GameAction, PlayerGameView, Resource } from "@catan/engine";

type RemovePlayerId<T> = T extends { playerId: string } ? Omit<T, "playerId"> : never;

export type GameActionPayload = RemovePlayerId<GameAction>;

export interface RoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  isHost: boolean;
  isSelf: boolean;
  online: boolean;
}

export interface LegalPlacements {
  settlementVertexIds: string[];
  roadIds: string[];
  freeRoadIds: string[];
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
