import { applyAction, createGame } from "../src";
import { emptyResources } from "../src/resources";
import type { GameState, PlayerConfig, Resource, ResourceBundle } from "../src/types";

export function playerConfigs(count = 4): PlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Jugador ${index + 1}`,
  }));
}

export function mainState(seed: number | string = 123, count = 4): GameState {
  const initial = createGame({ players: playerConfigs(count), seed });
  return {
    ...initial,
    phase: "main",
    setupIndex: initial.players.length * 2,
    turnNumber: 3,
    players: initial.players.map((player) => ({
      ...player,
      resources: { ...player.resources },
      developmentCards: [...player.developmentCards],
      roads: [...player.roads],
      settlements: [...player.settlements],
      cities: [...player.cities],
    })),
  };
}

export function bundle(values: Partial<ResourceBundle> = {}): ResourceBundle {
  return { ...emptyResources(), ...values };
}

export function setResource(
  state: GameState,
  playerIndex: number,
  resource: Resource,
  amount: number,
): void {
  state.players[playerIndex]!.resources[resource] = amount;
}

export function awaitingRollState(seed: number | string, count = 4): GameState {
  const initial = createGame({ players: playerConfigs(count), seed });
  return {
    ...initial,
    phase: "awaiting-roll",
    turnNumber: 1,
  };
}

export function findSeedForRoll(total: number): GameState {
  for (let seed = 1; seed <= 10_000; seed += 1) {
    const state = awaitingRollState(seed);
    const rolled = applyAction(state, { type: "roll", playerId: "p1" });
    if (rolled.lastRoll?.total === total) return state;
  }
  throw new Error(`No se encontró una semilla que produzca ${total}.`);
}

export function findStateWithRollOnHex(): {
  state: GameState;
  hexId: string;
  total: number;
} {
  for (let seed = 1; seed <= 10_000; seed += 1) {
    const state = awaitingRollState(seed);
    const rolled = applyAction(state, { type: "roll", playerId: "p1" });
    const total = rolled.lastRoll!.total;
    const hex = state.board.hexes.find(
      (candidate) => candidate.number === total && candidate.id !== state.robberHexId,
    );
    if (total !== 7 && hex) return { state, hexId: hex.id, total };
  }
  throw new Error("No se encontró una semilla con producción para la tirada inicial.");
}

export function findSimplePath(
  state: GameState,
  edgeCount: number,
): { edgeIds: string[]; vertexIds: string[] } {
  const edgesAtVertex = new Map<string, string[]>();
  for (const edge of state.board.edges) {
    for (const vertexId of edge.vertexIds) {
      const attached = edgesAtVertex.get(vertexId) ?? [];
      attached.push(edge.id);
      edgesAtVertex.set(vertexId, attached);
    }
  }
  const edgeById = new Map(state.board.edges.map((edge) => [edge.id, edge]));

  const search = (
    vertexId: string,
    usedVertices: Set<string>,
    pathEdges: string[],
    pathVertices: string[],
  ): { edgeIds: string[]; vertexIds: string[] } | null => {
    if (pathEdges.length === edgeCount) {
      return { edgeIds: pathEdges, vertexIds: pathVertices };
    }

    for (const edgeId of edgesAtVertex.get(vertexId) ?? []) {
      const edge = edgeById.get(edgeId)!;
      const nextVertexId = edge.vertexIds.find((candidate) => candidate !== vertexId)!;
      if (usedVertices.has(nextVertexId)) continue;
      const result = search(
        nextVertexId,
        new Set([...usedVertices, nextVertexId]),
        [...pathEdges, edgeId],
        [...pathVertices, nextVertexId],
      );
      if (result) return result;
    }
    return null;
  };

  for (const startVertexId of edgesAtVertex.keys()) {
    const result = search(startVertexId, new Set([startVertexId]), [], [startVertexId]);
    if (result) return result;
  }
  throw new Error(`No se encontró un camino simple de ${edgeCount} aristas.`);
}
