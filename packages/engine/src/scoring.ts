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

export function calculateLongestRoad(state: GameState, playerId: string): number {
  const player = getPlayer(state, playerId);
  if (player.roads.length === 0) return 0;

  const edgeById = new Map(state.board.edges.map((edge) => [edge.id, edge]));
  const roadsByVertex = new Map<string, string[]>();
  for (const edgeId of player.roads) {
    const edge = edgeById.get(edgeId);
    if (!edge) continue;
    for (const vertexId of edge.vertexIds) {
      const connectedEdges = roadsByVertex.get(vertexId) ?? [];
      connectedEdges.push(edgeId);
      roadsByVertex.set(vertexId, connectedEdges);
    }
  }

  const blockedVertices = new Set<string>();
  for (const otherPlayer of state.players) {
    if (otherPlayer.id === playerId) continue;
    for (const vertexId of [...otherPlayer.settlements, ...otherPlayer.cities]) {
      blockedVertices.add(vertexId);
    }
  }

  let longest = 0;
  const visit = (vertexId: string, usedEdges: Set<string>, length: number): void => {
    if (length > longest) longest = length;
    if (length > 0 && blockedVertices.has(vertexId)) return;

    for (const edgeId of roadsByVertex.get(vertexId) ?? []) {
      if (usedEdges.has(edgeId)) continue;
      const edge = edgeById.get(edgeId)!;
      const nextVertexId = edge.vertexIds.find((candidate) => candidate !== vertexId);
      if (!nextVertexId) continue;

      usedEdges.add(edgeId);
      visit(nextVertexId, usedEdges, length + 1);
      usedEdges.delete(edgeId);
    }
  };

  for (const startVertexId of roadsByVertex.keys()) {
    visit(startVertexId, new Set(), 0);
  }
  return longest;
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

export function getPublicVictoryPoints(state: GameState, playerId: string): number {
  const player = getPlayer(state, playerId);
  return (
    player.settlements.length +
    player.cities.length * 2 +
    (state.longestRoadHolderId === playerId ? 2 : 0) +
    (state.largestArmyHolderId === playerId ? 2 : 0)
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
