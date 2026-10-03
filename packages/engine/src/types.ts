export const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"] as const;

export type Resource = (typeof RESOURCES)[number];
export type Terrain = Resource | "desert" | "sea" | "gold";
export type ResourceBundle = Record<Resource, number>;

export const DEVELOPMENT_CARD_TYPES = [
  "knight",
  "victory-point",
  "road-building",
  "year-of-plenty",
  "monopoly",
] as const;

export type DevelopmentCardType = (typeof DEVELOPMENT_CARD_TYPES)[number];

export interface DevelopmentCard {
  id: string;
  type: DevelopmentCardType;
}

export interface HeldDevelopmentCard extends DevelopmentCard {
  boughtOnTurn: number;
}

export interface Hex {
  id: string;
  q: number;
  r: number;
  terrain: Terrain;
  number: number | null;
  neighborHexIds: string[];
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
  hexIds: string[];
  edgeIds: string[];
  adjacentVertexIds: string[];
}

export interface Edge {
  id: string;
  vertexIds: [string, string];
  hexIds: string[];
}

export type PortType = "generic" | Resource;

export interface Port {
  id: string;
  type: PortType;
  ratio: 2 | 3;
  edgeId: string;
  vertexIds: [string, string];
}

export interface BoardRegion {
  id: string;
  name: string;
  kind: "main" | "small-island";
  bonusVp: number;
  startingArea: boolean;
  hexIds: string[];
}

export interface Board {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  ports: Port[];
  regions?: BoardRegion[];
}

export interface PlayerConfig {
  id: string;
  name: string;
  color?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  resources: ResourceBundle;
  developmentCards: HeldDevelopmentCard[];
  boughtDevelopmentCards: DevelopmentCardType[];
  roads: string[];
  ships: string[];
  settlements: string[];
  cities: string[];
  playedKnights: number;
  bonusVpTokens: BonusVpToken[];
}

export interface BonusVpToken {
  vertexId: string;
  regionId: string;
  amount: number;
}

export type GamePhase =
  | "setup-settlement"
  | "setup-road"
  | "awaiting-roll"
  | "discard"
  | "activate"
  | "robber"
  | "robber-victim"
  | "pirate"
  | "pirate-victim"
  | "gold"
  | "main"
  | "trade"
  | "finished";

export interface PendingRobberVictim {
  hexId: string;
  victimIds: string[];
}

export type PiratePosition = { kind: "frame" } | { kind: "hex"; hexId: string };

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  give: ResourceBundle;
  want: ResourceBundle;
  acceptedBy: string[];
  rejectedBy: string[];
}

export interface DiceRoll {
  dice: [number, number];
  total: number;
}

export interface GameState {
  board: Board;
  players: PlayerState[];
  bank: ResourceBundle;
  developmentDeck: DevelopmentCard[];
  phase: GamePhase;
  scenarioId: string;
  winThreshold: number;
  currentPlayerIndex: number;
  setupIndex: number;
  setupRoadFromVertexId: string | null;
  turnNumber: number;
  hasRolled: boolean;
  robberHexId: string;
  piratePosition: PiratePosition | null;
  pendingDiscards: Record<string, number>;
  pendingGoldChoices: Record<string, number>;
  pendingRobberVictim: PendingRobberVictim | null;
  pendingPirateVictim: PendingRobberVictim | null;
  shipsBuiltThisTurn: string[];
  movedShipThisTurn: boolean;
  activeTrade: TradeOffer | null;
  longestRoadHolderId: string | null;
  largestArmyHolderId: string | null;
  playedDevelopmentCardThisTurn: boolean;
  lastRoll: DiceRoll | null;
  rollHistory: number[];
  winnerId: string | null;
  rngState: number;
  nextTradeId: number;
}

export interface RollStat {
  total: number;
  count: number;
}

export interface DevelopmentCardStat {
  type: DevelopmentCardType;
  count: number;
}

export interface GameStats {
  rollCounts: RollStat[];
  developmentCardsBought: Record<string, DevelopmentCardStat[]>;
}

export interface CreateGameOptions {
  players: PlayerConfig[];
  seed: number | string;
  scenarioId?: string;
  setupMode?: "fixed" | "variable";
  forbidRedOnGold?: boolean;
  mainIslandNoGold?: boolean;
}

export type RouteKind = "road" | "ship";

export type GameAction =
  | { type: "place-setup-settlement"; playerId: string; vertexId: string }
  | { type: "place-setup-road"; playerId: string; edgeId: string; kind?: RouteKind }
  | { type: "roll"; playerId: string }
  | { type: "discard"; playerId: string; resources: ResourceBundle }
  | {
      type: "move-robber";
      playerId: string;
      hexId: string;
      victimId: string | null;
    }
  | { type: "choose-robber-victim"; playerId: string; victimId: string }
  | { type: "activate-robber"; playerId: string }
  | { type: "activate-pirate"; playerId: string }
  | { type: "move-pirate"; playerId: string; hexId: string | null }
  | { type: "choose-pirate-victim"; playerId: string; victimId: string }
  | { type: "choose-gold"; playerId: string; resources: Resource[] }
  | { type: "build-road"; playerId: string; edgeId: string }
  | { type: "build-ship"; playerId: string; edgeId: string }
  | { type: "move-ship"; playerId: string; fromEdgeId: string; toEdgeId: string }
  | { type: "build-settlement"; playerId: string; vertexId: string }
  | { type: "build-city"; playerId: string; vertexId: string }
  | { type: "buy-development-card"; playerId: string }
  | { type: "play-knight"; playerId: string; cardId: string }
  | {
      type: "play-monopoly";
      playerId: string;
      cardId: string;
      resource: Resource;
    }
  | {
      type: "play-year-of-plenty";
      playerId: string;
      cardId: string;
      resources: Resource[];
    }
  | {
      type: "play-road-building";
      playerId: string;
      cardId: string;
      edgeIds: string[];
      kinds?: RouteKind[];
    }
  | {
      type: "make-offer";
      playerId: string;
      give: ResourceBundle;
      want: ResourceBundle;
    }
  | {
      type: "counter-offer";
      playerId: string;
      give: ResourceBundle;
      want: ResourceBundle;
    }
  | { type: "accept-offer"; playerId: string }
  | { type: "reject-offer"; playerId: string }
  | { type: "confirm-offer"; playerId: string; partnerId: string }
  | { type: "cancel-offer"; playerId: string }
  | {
      type: "maritime-trade";
      playerId: string;
      giveResource: Resource;
      giveAmount: number;
      receiveResource: Resource;
    }
  | { type: "end-turn"; playerId: string };

export interface PlayerPublicView {
  id: string;
  name: string;
  color: string;
  resourceCardCount: number;
  developmentCardCount: number;
  roadIds: string[];
  shipIds: string[];
  settlementVertexIds: string[];
  cityVertexIds: string[];
  roadsBuilt: number;
  shipsBuilt: number;
  settlementsBuilt: number;
  citiesBuilt: number;
  playedKnights: number;
  longestRoadLength: number;
  publicVictoryPoints: number;
  bonusVictoryPoints: number;
  isCurrentPlayer: boolean;
}

export interface PlayerPrivateView {
  resources: ResourceBundle;
  developmentCards: HeldDevelopmentCard[];
  hiddenVictoryPoints: number;
  totalVictoryPoints: number;
  pendingDiscardCount: number;
  pendingGoldCount: number;
}

export interface PlayerGameView {
  board: Board;
  bank: ResourceBundle;
  developmentDeckCount: number;
  phase: GamePhase;
  scenarioId: string;
  winThreshold: number;
  hasRolled: boolean;
  turnNumber: number;
  playedDevelopmentCardThisTurn: boolean;
  currentPlayerId: string;
  players: PlayerPublicView[];
  self: PlayerPrivateView;
  robberHexId: string;
  piratePosition: PiratePosition | null;
  movedShipThisTurn: boolean;
  pendingRobberVictim: PendingRobberVictim | null;
  pendingPirateVictim: PendingRobberVictim | null;
  lastRoll: DiceRoll | null;
  activeTrade: TradeOffer | null;
  longestRoadHolderId: string | null;
  largestArmyHolderId: string | null;
  winnerId: string | null;
  stats: GameStats | null;
}
