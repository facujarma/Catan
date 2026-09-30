import {
  calculateLongestRoad,
  getCurrentPlayerId,
  getPublicVictoryPoints,
  getVictoryPoints,
} from "./scoring";
import { totalResources } from "./resources";
import { DEVELOPMENT_CARD_TYPES } from "./types";
import type {
  Board,
  DevelopmentCardStat,
  GameState,
  GameStats,
  PlayerGameView,
} from "./types";

function buildGameStats(state: GameState): GameStats {
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

export function getPlayerView(state: GameState, viewerId: string): PlayerGameView {
  const viewer = state.players.find((player) => player.id === viewerId);
  if (!viewer) throw new Error(`No existe el jugador ${viewerId}.`);

  const board: Board = {
    hexes: state.board.hexes.map((hex) => ({
      ...hex,
      neighborHexIds: [...hex.neighborHexIds],
    })),
    vertices: state.board.vertices.map((vertex) => ({
      ...vertex,
      hexIds: [...vertex.hexIds],
      edgeIds: [...vertex.edgeIds],
      adjacentVertexIds: [...vertex.adjacentVertexIds],
    })),
    edges: state.board.edges.map((edge) => ({
      ...edge,
      vertexIds: [...edge.vertexIds] as [string, string],
      hexIds: [...edge.hexIds],
    })),
    ports: state.board.ports.map((port) => ({
      ...port,
      vertexIds: [...port.vertexIds] as [string, string],
    })),
  };
  if (state.board.regions) {
    board.regions = state.board.regions.map((region) => ({
      ...region,
      hexIds: [...region.hexIds],
    }));
  }

  return {
    board,
    bank: { ...state.bank },
    developmentDeckCount: state.developmentDeck.length,
    phase: state.phase,
    hasRolled: state.hasRolled,
    turnNumber: state.turnNumber,
    playedDevelopmentCardThisTurn: state.playedDevelopmentCardThisTurn,
    currentPlayerId: getCurrentPlayerId(state),
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      resourceCardCount: totalResources(player.resources),
      developmentCardCount: player.developmentCards.length,
      roadIds: [...player.roads],
      shipIds: [...player.ships],
      settlementVertexIds: [...player.settlements],
      cityVertexIds: [...player.cities],
      roadsBuilt: player.roads.length,
      shipsBuilt: player.ships.length,
      settlementsBuilt: player.settlements.length,
      citiesBuilt: player.cities.length,
      playedKnights: player.playedKnights,
      longestRoadLength: calculateLongestRoad(state, player.id),
      publicVictoryPoints: getPublicVictoryPoints(state, player.id),
      bonusVictoryPoints: player.bonusVpTokens.reduce((total, token) => total + token.amount, 0),
      isCurrentPlayer: player.id === getCurrentPlayerId(state),
    })),
    self: {
      resources: { ...viewer.resources },
      developmentCards: viewer.developmentCards.map((card) => ({ ...card })),
      hiddenVictoryPoints: viewer.developmentCards.filter(
        (card) => card.type === "victory-point",
      ).length,
      totalVictoryPoints: getVictoryPoints(state, viewerId),
      pendingDiscardCount: state.pendingDiscards[viewerId] ?? 0,
      pendingGoldCount: state.pendingGoldChoices[viewerId] ?? 0,
    },
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
