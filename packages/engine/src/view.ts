import {
  calculateLongestRoad,
  getCurrentPlayerId,
  getPublicVictoryPoints,
} from "./scoring";
import { emptyResources, totalResources } from "./resources";
import { DEVELOPMENT_CARD_TYPES } from "./types";
import type {
  Board,
  DevelopmentCardStat,
  GameState,
  GameStats,
  HeldDevelopmentCard,
  PlayerGameView,
  PlayerPrivateView,
  PlayerPublicView,
  PlayerState,
  ResourceBundle,
} from "./types";

export type StoredPublicPlayer = Omit<PlayerState, "resources" | "developmentCards"> & {
  resourceCount: number;
  developmentCardCount: number;
};

export type StoredPublicState = Omit<GameState, "board" | "players"> & {
  players: StoredPublicPlayer[];
};

export interface StoredPrivatePlayerState {
  resources: ResourceBundle;
  developmentCards: HeldDevelopmentCard[];
}

export interface SplitGameState {
  board: Board;
  publicState: StoredPublicState;
  privateStates: Record<string, StoredPrivatePlayerState>;
}

type ViewState = Omit<GameState, "board"> & {
  players: Array<StoredPublicPlayer | PlayerState>;
};

function asRulesState(state: ViewState | StoredPublicState | GameState): GameState {
  return state as unknown as GameState;
}

function resourceCountOf(player: StoredPublicPlayer | PlayerState): number {
  return "resourceCount" in player ? player.resourceCount : totalResources(player.resources);
}

function developmentCardCountOf(player: StoredPublicPlayer | PlayerState): number {
  return "developmentCardCount" in player
    ? player.developmentCardCount
    : player.developmentCards.length;
}

function buildGameStats(state: ViewState | StoredPublicState): GameStats {
  const rollCounts = [];
  for (let total = 2; total <= 12; total += 1) {
    rollCounts.push({
      total,
      count: state.rollHistory.filter((roll) => roll === total).length,
    });
  }

  const developmentCardsBought: Record<string, DevelopmentCardStat[]> = {};
  for (const player of state.players) {
    developmentCardsBought[player.id] = DEVELOPMENT_CARD_TYPES.map((type) => ({
      type,
      count: player.boughtDevelopmentCards.filter((cardType) => cardType === type).length,
    })).filter((stat) => stat.count > 0);
  }

  return { rollCounts, developmentCardsBought };
}

function buildPublicPlayerView(
  state: ViewState | StoredPublicState,
  player: StoredPublicPlayer | PlayerState,
  longestRoadLengths: Record<string, number>,
): PlayerPublicView {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    resourceCardCount: resourceCountOf(player),
    developmentCardCount: developmentCardCountOf(player),
    roadIds: [...player.roads],
    shipIds: [...player.ships],
    settlementVertexIds: [...player.settlements],
    cityVertexIds: [...player.cities],
    roadsBuilt: player.roads.length,
    shipsBuilt: player.ships.length,
    settlementsBuilt: player.settlements.length,
    citiesBuilt: player.cities.length,
    playedKnights: player.playedKnights,
    longestRoadLength: longestRoadLengths[player.id] ?? 0,
    publicVictoryPoints: getPublicVictoryPoints(asRulesState(state), player.id),
    bonusVictoryPoints: player.bonusVpTokens.reduce((total, token) => total + token.amount, 0),
    isCurrentPlayer: player.id === getCurrentPlayerId(asRulesState(state)),
  };
}

export function buildPublicGameView(
  state: ViewState | StoredPublicState,
  longestRoadLengths: Record<string, number>,
): Omit<PlayerGameView, "board" | "self"> {
  return {
    bank: { ...state.bank },
    developmentDeckCount: state.developmentDeck.length,
    phase: state.phase,
    hasRolled: state.hasRolled,
    turnNumber: state.turnNumber,
    playedDevelopmentCardThisTurn: state.playedDevelopmentCardThisTurn,
    currentPlayerId: getCurrentPlayerId(asRulesState(state)),
    players: state.players.map((player) => buildPublicPlayerView(state, player, longestRoadLengths)),
    robberHexId: state.robberHexId,
    piratePosition: state.piratePosition
      ? state.piratePosition.kind === "frame"
        ? { kind: "frame" }
        : { kind: "hex", hexId: state.piratePosition.hexId }
      : null,
    movedShipThisTurn: state.movedShipThisTurn,
    scenarioId: state.scenarioId,
    winThreshold: state.winThreshold,
    pendingRobberVictim: state.pendingRobberVictim
      ? {
          hexId: state.pendingRobberVictim.hexId,
          victimIds: [...state.pendingRobberVictim.victimIds],
        }
      : null,
    pendingPirateVictim: state.pendingPirateVictim
      ? {
          hexId: state.pendingPirateVictim.hexId,
          victimIds: [...state.pendingPirateVictim.victimIds],
        }
      : null,
    lastRoll: state.lastRoll
      ? { dice: [...state.lastRoll.dice] as [number, number], total: state.lastRoll.total }
      : null,
    activeTrade: state.activeTrade
      ? {
          ...state.activeTrade,
          give: { ...state.activeTrade.give },
          want: { ...state.activeTrade.want },
          acceptedBy: [...state.activeTrade.acceptedBy],
          rejectedBy: [...state.activeTrade.rejectedBy],
        }
      : null,
    longestRoadHolderId: state.longestRoadHolderId,
    largestArmyHolderId: state.largestArmyHolderId,
    winnerId: state.winnerId,
    stats: state.phase === "finished" ? buildGameStats(state) : null,
  };
}

export function buildPrivatePlayerView(
  state: ViewState | StoredPublicState,
  privateState: StoredPrivatePlayerState,
  viewerId: string,
): PlayerPrivateView {
  const hiddenVictoryPoints = privateState.developmentCards.filter(
    (card) => card.type === "victory-point",
  ).length;
  return {
    resources: { ...privateState.resources },
    developmentCards: privateState.developmentCards.map((card) => ({ ...card })),
    hiddenVictoryPoints,
    totalVictoryPoints:
      getPublicVictoryPoints(asRulesState(state), viewerId) + hiddenVictoryPoints,
    pendingDiscardCount: state.pendingDiscards[viewerId] ?? 0,
    pendingGoldCount: state.pendingGoldChoices[viewerId] ?? 0,
  };
}

export function splitGameState(state: GameState): SplitGameState {
  const { board, players, ...rest } = state;
  const privateStates: Record<string, StoredPrivatePlayerState> = {};
  const publicPlayers: StoredPublicPlayer[] = players.map((player) => {
    const { resources, developmentCards, ...publicFields } = player;
    privateStates[player.id] = {
      resources: { ...resources },
      developmentCards: developmentCards.map((card) => ({ ...card })),
    };
    return {
      ...publicFields,
      resourceCount: totalResources(resources),
      developmentCardCount: developmentCards.length,
    };
  });
  return {
    board,
    publicState: { ...rest, players: publicPlayers },
    privateStates,
  };
}

export function joinGameState(
  publicState: StoredPublicState,
  board: Board,
  privateStates: Record<string, StoredPrivatePlayerState>,
): GameState {
  const players: PlayerState[] = publicState.players.map((stored) => {
    const { resourceCount: _resourceCount, developmentCardCount: _developmentCardCount, ...publicFields } =
      stored;
    const privateState = privateStates[publicFields.id];
    return {
      ...publicFields,
      resources: privateState ? { ...privateState.resources } : emptyResources(),
      developmentCards: privateState ? privateState.developmentCards.map((card) => ({ ...card })) : [],
    } as PlayerState;
  });
  return { ...publicState, board, players } as GameState;
}

function cloneBoard(board: Board): Board {
  const clone: Board = {
    hexes: board.hexes.map((hex) => ({
      ...hex,
      neighborHexIds: [...hex.neighborHexIds],
    })),
    vertices: board.vertices.map((vertex) => ({
      ...vertex,
      hexIds: [...vertex.hexIds],
      edgeIds: [...vertex.edgeIds],
      adjacentVertexIds: [...vertex.adjacentVertexIds],
    })),
    edges: board.edges.map((edge) => ({
      ...edge,
      vertexIds: [...edge.vertexIds] as [string, string],
      hexIds: [...edge.hexIds],
    })),
    ports: board.ports.map((port) => ({
      ...port,
      vertexIds: [...port.vertexIds] as [string, string],
    })),
  };
  if (board.regions) {
    clone.regions = board.regions.map((region) => ({
      ...region,
      hexIds: [...region.hexIds],
    }));
  }
  return clone;
}

export function getPlayerView(state: GameState, viewerId: string): PlayerGameView {
  const viewer = state.players.find((player) => player.id === viewerId);
  if (!viewer) throw new Error(`No existe el jugador ${viewerId}.`);

  const longestRoadLengths: Record<string, number> = {};
  for (const player of state.players) {
    longestRoadLengths[player.id] = calculateLongestRoad(state, player.id);
  }

  return {
    board: cloneBoard(state.board),
    ...buildPublicGameView(state, longestRoadLengths),
    self: buildPrivatePlayerView(
      state,
      { resources: viewer.resources, developmentCards: viewer.developmentCards },
      viewerId,
    ),
  };
}
