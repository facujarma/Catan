import {
  applyAction,
  createGame,
  getCurrentPlayerId,
  getLegalCityUpgrades,
  getLegalRoadPlacements,
  getLegalSettlementPlacements,
  getMaritimeTradeRatio,
  getPlayerView,
  recalculateAwards,
} from "@catan/engine";
import type { GameState, ResourceBundle } from "@catan/engine";
import type { ChatMessage, GameEvent, RoomSnapshot } from "./model";

const DEMO_PLAYERS = [
  { id: "demo-you", name: "Vos" },
  { id: "demo-ana", name: "Ana" },
  { id: "demo-bruno", name: "Bruno" },
  { id: "demo-luz", name: "Luz" },
];

function resourcePile(amount: number): ResourceBundle {
  return { wood: amount, brick: amount, sheep: amount, wheat: amount, ore: amount };
}

function chooseSettlement(state: GameState, legalVertexIds: string[]): string {
  const vertexById = new Map(state.board.vertices.map((vertex) => [vertex.id, vertex]));
  const occupied = state.players.flatMap((player) => [...player.settlements, ...player.cities]);
  const occupiedVertices = occupied.map((vertexId) => vertexById.get(vertexId)!).filter(Boolean);
  const hexById = new Map(state.board.hexes.map((hex) => [hex.id, hex]));
  const pipValue: Record<number, number> = {
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    8: 5,
    9: 4,
    10: 3,
    11: 2,
    12: 1,
  };

  return legalVertexIds
    .map((vertexId) => {
      const vertex = vertexById.get(vertexId)!;
      const spacing = occupiedVertices.length
        ? Math.min(...occupiedVertices.map((other) => Math.hypot(vertex.x - other.x, vertex.y - other.y)))
        : 0;
      const production = vertex.hexIds.reduce((sum, hexId) => {
        const number = hexById.get(hexId)?.number;
        return sum + (number === null || number === undefined ? 0 : pipValue[number] ?? 0);
      }, 0);
      return { vertexId, score: spacing * 4 + production };
    })
    .sort((left, right) => right.score - left.score)[0]!.vertexId;
}

function chooseSetupRoad(state: GameState, legalEdgeIds: string[]): string {
  const start = state.board.vertices.find(
    (vertex) => vertex.id === state.setupRoadFromVertexId,
  )!;
  const vertexById = new Map(state.board.vertices.map((vertex) => [vertex.id, vertex]));
  return legalEdgeIds
    .map((edgeId) => {
      const edge = state.board.edges.find((candidate) => candidate.id === edgeId)!;
      const destination = vertexById.get(edge.vertexIds.find((vertexId) => vertexId !== start.id)!)!;
      return { edgeId, score: Math.hypot(destination.x, destination.y) - Math.hypot(start.x, start.y) };
    })
    .sort((left, right) => right.score - left.score)[0]!.edgeId;
}

function finishSetup(state: GameState): GameState {
  let next = state;
  for (let placement = 0; placement < DEMO_PLAYERS.length * 2; placement += 1) {
    const playerId = getCurrentPlayerId(next);
    const legalVertices = getLegalSettlementPlacements(next, playerId);
    const vertexId = chooseSettlement(next, legalVertices);
    next = applyAction(next, {
      type: "place-setup-settlement",
      playerId,
      vertexId,
    });

    const legalRoads = getLegalRoadPlacements(next, playerId);
    const edgeId = chooseSetupRoad(next, legalRoads);
    next = applyAction(next, { type: "place-setup-road", playerId, edgeId });
  }
  return next;
}

function decorateGame(initial: GameState): GameState {
  let state: GameState = {
    ...initial,
    players: initial.players.map((player) => ({
      ...player,
      resources: resourcePile(12),
    })),
  };

  for (let playerIndex = 0; playerIndex < state.players.length; playerIndex += 1) {
    state.phase = "main";
    state.hasRolled = true;
    state.currentPlayerIndex = playerIndex;
    state.turnNumber = 4 + playerIndex;
    state.playedDevelopmentCardThisTurn = false;
    const playerId = state.players[playerIndex]!.id;
    const firstSettlement = state.players[playerIndex]!.settlements[0];

    if (firstSettlement) {
      state = applyAction(state, {
        type: "build-city",
        playerId,
        vertexId: firstSettlement,
      });
    }

    for (let roadCount = 0; roadCount < 2; roadCount += 1) {
      const legalRoads = getLegalRoadPlacements(state, playerId);
      if (legalRoads.length === 0) break;
      state = applyAction(state, {
        type: "build-road",
        playerId,
        edgeId: legalRoads[0]!,
      });
    }

    const legalSettlements = getLegalSettlementPlacements(state, playerId);
    if (legalSettlements.length > 0) {
      state = applyAction(state, {
        type: "build-settlement",
        playerId,
        vertexId: chooseSettlement(state, legalSettlements),
      });
    }
  }

  state.currentPlayerIndex = 0;
  state.phase = "main";
  state.turnNumber = 8;
  state.playedDevelopmentCardThisTurn = false;
  state.lastRoll = { dice: [3, 3], total: 6 };

  const eightHex = state.board.hexes.find((hex) => hex.number === 8);
  if (eightHex) state.robberHexId = eightHex.id;

  const player = state.players[0]!;
  player.playedKnights = 3;
  for (const cardType of ["knight", "victory-point"] as const) {
    const cardIndex = state.developmentDeck.findIndex((card) => card.type === cardType);
    if (cardIndex < 0) continue;
    const [card] = state.developmentDeck.splice(cardIndex, 1);
    player.developmentCards.push({ ...card!, boughtOnTurn: 4 });
  }
  recalculateAwards(state);
  return state;
}

export function createDemoSnapshot(): {
  room: RoomSnapshot;
  messages: ChatMessage[];
  events: GameEvent[];
} {
  const initial = createGame({ players: DEMO_PLAYERS, seed: "catan-ui-preview" });
  const state = decorateGame(finishSetup(initial));
  const playerId = DEMO_PLAYERS[0]!.id;
  const game = getPlayerView(state, playerId);
  const timestamp = Date.now();
  const room: RoomSnapshot = {
    code: "VISTA",
    status: "playing",
    hostPlayerId: playerId,
    selfPlayerId: playerId,
    players: state.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      ready: true,
      isBot: index === 3,
      isHost: index === 0,
      isSelf: index === 0,
      online: true,
    })),
    turnTimeLimitSeconds: 60,
    turnDeadlineAt: timestamp + 45_000,
    tradeRespondDeadlineAt: null,
    pausedAt: null,
    pauseRemainingMs: null,
    pauseRequest: null,
    turnStats: {
      "demo-you": { totalMs: 96_000, turns: 3, lastTurnMs: 28_000 },
      "demo-ana": { totalMs: 74_000, turns: 2, lastTurnMs: 41_000 },
      "demo-bruno": { totalMs: 312_000, turns: 3, lastTurnMs: 128_000 },
      "demo-luz": { totalMs: 88_000, turns: 2, lastTurnMs: 44_000 },
    },
    game,
    legal: {
      settlementVertexIds: getLegalSettlementPlacements(state, playerId),
      roadIds: getLegalRoadPlacements(state, playerId),
      freeRoadIds: getLegalRoadPlacements(state, playerId, { free: true }),
      cityVertexIds: getLegalCityUpgrades(state, playerId),
      tradeRatios: {
        wood: getMaritimeTradeRatio(state, playerId, "wood"),
        brick: getMaritimeTradeRatio(state, playerId, "brick"),
        sheep: getMaritimeTradeRatio(state, playerId, "sheep"),
        wheat: getMaritimeTradeRatio(state, playerId, "wheat"),
        ore: getMaritimeTradeRatio(state, playerId, "ore"),
      },
      robberHexIds: state.board.hexes
        .filter((hex) => hex.id !== state.robberHexId)
        .map((hex) => hex.id),
    },
  };

  const messages: ChatMessage[] = [
    { id: "demo-chat-1", playerId: "demo-ana", playerName: "Ana", body: "¡Buen bosque, me salió 8!", createdAt: timestamp - 120_000 },
    { id: "demo-chat-2", playerId: "demo-you", playerName: "Vos", body: "¿Alguien cambia trigo por ladrillo?", createdAt: timestamp - 65_000 },
    { id: "demo-chat-3", playerId: "demo-bruno", playerName: "Bruno", body: "Dale, te paso uno.", createdAt: timestamp - 48_000 },
  ];
  const events: GameEvent[] = [
    { id: "demo-event-1", actorId: "demo-you", actorName: "Vos", kind: "action", message: "Vos construiste un camino.", createdAt: timestamp - 95_000 },
    { id: "demo-event-2", actorId: "demo-ana", actorName: "Ana", kind: "action", message: "Ana mejoró un poblado a ciudad.", createdAt: timestamp - 78_000 },
    { id: "demo-event-3", actorId: "demo-bruno", actorName: "Bruno", kind: "action", message: "Bruno jugó un caballero.", createdAt: timestamp - 35_000 },
  ];

  return { room, messages, events };
}
