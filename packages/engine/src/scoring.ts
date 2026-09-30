import { type GameState, type PlayerState } from "./types";

function getPlayer(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`No existe el jugador ${playerId}.`);
  return player;
}

function ownerAtVertex(state: GameState, vertexId: string): string | null {
  for (const player of state.players) {
    if (player.settlements.includes(vertexId) || player.cities.includes(vertexId)) {
      return player.id;
    }
  }
  return null;
}

interface RouteGraph {
  kindByEdge: Map<string, "road" | "ship">;
  edgesByVertex: Map<string, string[]>;
  edgeById: Map<string, { id: string; vertexIds: [string, string] }>;
}

function buildRouteGraph(state: GameState, playerId: string): RouteGraph {
  const player = getPlayer(state, playerId);
  const kindByEdge = new Map<string, "road" | "ship">();
  for (const edgeId of player.roads) kindByEdge.set(edgeId, "road");
  for (const edgeId of player.ships) kindByEdge.set(edgeId, "ship");

  const edgeById = new Map<string, { id: string; vertexIds: [string, string] }>();
  const edgesByVertex = new Map<string, string[]>();
  for (const edge of state.board.edges) {
    if (!kindByEdge.has(edge.id)) continue;
    edgeById.set(edge.id, { id: edge.id, vertexIds: edge.vertexIds });
    for (const vertexId of edge.vertexIds) {
      const list = edgesByVertex.get(vertexId) ?? [];
      list.push(edge.id);
      edgesByVertex.set(vertexId, list);
    }
  }
  return { kindByEdge, edgesByVertex, edgeById };
}

function ownBuildingAt(state: GameState, playerId: string, vertexId: string): boolean {
  const player = getPlayer(state, playerId);
  return player.settlements.includes(vertexId) || player.cities.includes(vertexId);
}

export function calculateLongestRoad(state: GameState, playerId: string): number {
  const graph = buildRouteGraph(state, playerId);
  if (graph.kindByEdge.size === 0) return 0;

  const blockedVertices = new Set<string>();
  for (const otherPlayer of state.players) {
    if (otherPlayer.id === playerId) continue;
    for (const vertexId of [...otherPlayer.settlements, ...otherPlayer.cities]) {
      blockedVertices.add(vertexId);
    }
  }

  let longest = 0;
  const visit = (
    vertexId: string,
    previousEdgeId: string | null,
    usedEdges: Set<string>,
    length: number,
  ): void => {
    if (length > longest) longest = length;
    if (length > 0 && blockedVertices.has(vertexId)) return;

    for (const edgeId of graph.edgesByVertex.get(vertexId) ?? []) {
      if (usedEdges.has(edgeId)) continue;
      if (previousEdgeId !== null) {
        const previousKind = graph.kindByEdge.get(previousEdgeId);
        const nextKind = graph.kindByEdge.get(edgeId);
        if (previousKind !== nextKind && !ownBuildingAt(state, playerId, vertexId)) continue;
      }
      const edge = graph.edgeById.get(edgeId)!;
      const nextVertexId = edge.vertexIds.find((candidate) => candidate !== vertexId);
      if (!nextVertexId) continue;

      usedEdges.add(edgeId);
      visit(nextVertexId, edgeId, usedEdges, length + 1);
      usedEdges.delete(edgeId);
    }
  };

  for (const startVertexId of graph.edgesByVertex.keys()) {
    visit(startVertexId, null, new Set(), 0);
  }
  return longest;
}

export function isShipPartOfClosedLine(
  state: GameState,
  playerId: string,
  edgeId: string,
): boolean {
  const player = getPlayer(state, playerId);
  if (!player.ships.includes(edgeId)) return false;
  const edge = state.board.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return false;

  const shipEdgesByVertex = new Map<string, string[]>();
  for (const shipId of player.ships) {
    if (shipId === edgeId) continue;
    const shipEdge = state.board.edges.find((candidate) => candidate.id === shipId);
    if (!shipEdge) continue;
    for (const vertexId of shipEdge.vertexIds) {
      const list = shipEdgesByVertex.get(vertexId) ?? [];
      list.push(shipId);
      shipEdgesByVertex.set(vertexId, list);
    }
  }

  const reachesBuilding = (startVertexId: string): boolean => {
    const seen = new Set<string>([startVertexId]);
    const stack = [startVertexId];
    while (stack.length > 0) {
      const vertexId = stack.pop()!;
      if (ownBuildingAt(state, playerId, vertexId)) return true;
      for (const shipId of shipEdgesByVertex.get(vertexId) ?? []) {
        const shipEdge = state.board.edges.find((candidate) => candidate.id === shipId)!;
        const nextVertexId = shipEdge.vertexIds.find((candidate) => candidate !== vertexId);
        if (!nextVertexId || seen.has(nextVertexId)) continue;
        seen.add(nextVertexId);
        stack.push(nextVertexId);
      }
    }
    return false;
  };

  return reachesBuilding(edge.vertexIds[0]) && reachesBuilding(edge.vertexIds[1]);
}

function chooseAwardHolder(
  scores: ReadonlyArray<{ playerId: string; score: number }>,
  currentHolderId: string | null,
  threshold: number,
): string | null {
  const highScore = Math.max(0, ...scores.map(({ score }) => score));
  if (highScore < threshold) return null;

  if (currentHolderId) {
    const currentScore = scores.find(({ playerId }) => playerId === currentHolderId)?.score;
    if (currentScore === highScore) return currentHolderId;
  }

  const leaders = scores.filter(({ score }) => score === highScore);
  return leaders.length === 1 ? leaders[0]!.playerId : null;
}

export function recalculateAwards(state: GameState): void {
  state.longestRoadHolderId = chooseAwardHolder(
    state.players.map((player) => ({
      playerId: player.id,
      score: calculateLongestRoad(state, player.id),
    })),
    state.longestRoadHolderId,
    5,
  );

  state.largestArmyHolderId = chooseAwardHolder(
    state.players.map((player) => ({
      playerId: player.id,
      score: player.playedKnights,
    })),
    state.largestArmyHolderId,
    3,
  );
}

export function getBonusVictoryPoints(state: GameState, playerId: string): number {
  const player = getPlayer(state, playerId);
  return player.bonusVpTokens.reduce((total, token) => total + token.amount, 0);
}

export function getPublicVictoryPoints(state: GameState, playerId: string): number {
  const player = getPlayer(state, playerId);
  return (
    player.settlements.length +
    player.cities.length * 2 +
    (state.longestRoadHolderId === playerId ? 2 : 0) +
    (state.largestArmyHolderId === playerId ? 2 : 0) +
    getBonusVictoryPoints(state, playerId)
  );
}

export function getVictoryPoints(state: GameState, playerId: string): number {
  const player = getPlayer(state, playerId);
  const hiddenCards = player.developmentCards.filter(
    (card) => card.type === "victory-point",
  ).length;
  return getPublicVictoryPoints(state, playerId) + hiddenCards;
}

export function getCurrentPlayerId(state: GameState): string {
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error("El estado no tiene un jugador activo válido.");
  return player.id;
}

export function getSettlementOwner(state: GameState, vertexId: string): string | null {
  return ownerAtVertex(state, vertexId);
}
