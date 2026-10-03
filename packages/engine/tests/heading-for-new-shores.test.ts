import { describe, expect, test } from "vitest";
import {
  applyAction,
  buildScenarioBoard,
  createGame,
  getBonusVictoryPoints,
  getLegalRoadPlacements,
  getLegalShipMoveTargets,
  getLegalShipPlacements,
  getLegalSettlementPlacements,
  getPirateVictims,
  SeededRandom,
} from "../src";
import type { GameState } from "../src/types";
import { playerConfigs } from "./helpers";

const SCENARIO = "heading-for-new-shores";

function buildFixed(playerCount: 3 | 4) {
  return buildScenarioBoard(SCENARIO, playerCount, "fixed", new SeededRandom(7));
}

function buildVariable(playerCount: 3 | 4, seed = 42) {
  return buildScenarioBoard(SCENARIO, playerCount, "variable", new SeededRandom(seed));
}

function countByTerrain(board: ReturnType<typeof buildFixed>["board"]) {
  const counts: Record<string, number> = {};
  for (const hex of board.hexes) {
    counts[hex.terrain] = (counts[hex.terrain] ?? 0) + 1;
  }
  return counts;
}

function countNumbers(board: ReturnType<typeof buildFixed>["board"]) {
  const counts: Record<number, number> = {};
  for (const hex of board.hexes) {
    if (hex.number === null) continue;
    counts[hex.number] = (counts[hex.number] ?? 0) + 1;
  }
  return counts;
}

function hasAdjacentRedNumbers(board: ReturnType<typeof buildFixed>["board"]): boolean {
  const byId = new Map(board.hexes.map((hex) => [hex.id, hex]));
  for (const hex of board.hexes) {
    if (hex.number !== 6 && hex.number !== 8) continue;
    for (const neighborId of hex.neighborHexIds) {
      const neighbor = byId.get(neighborId);
      if (!neighbor || neighbor.number === null) continue;
      if (neighbor.number === 6 || neighbor.number === 8) return true;
    }
  }
  return false;
}

describe("escenario 1: Rumbo a nuevas costas", () => {
  test("el mapa fijo de 3 jugadores coincide con la tabla del manual", () => {
    const { board } = buildFixed(3);
    const counts = countByTerrain(board);
    expect(counts.sea).toBeGreaterThanOrEqual(13);
    expect(counts.gold).toBe(2);
    expect(counts.brick).toBe(4);
    expect(counts.wood).toBe(3);
    expect(counts.sheep).toBe(5);
    expect(counts.wheat).toBe(4);
    expect(counts.ore).toBe(4);
    expect(counts.desert).toBeUndefined();
    expect(countNumbers(board)).toEqual({ 2: 1, 3: 2, 4: 3, 5: 3, 6: 2, 8: 3, 9: 2, 10: 3, 11: 2, 12: 1 });
    expect(board.ports).toHaveLength(8);
    expect(board.ports.filter((port) => port.ratio === 2)).toHaveLength(5);
    expect(board.ports.filter((port) => port.ratio === 3)).toHaveLength(3);
    const regions = board.regions!;
    expect(regions.filter((region) => region.kind === "small-island")).toHaveLength(4);
    expect(regions.find((region) => region.kind === "main")!.hexIds).toHaveLength(12);
  });

  test("el mapa fijo de 4 jugadores coincide con la tabla del manual", () => {
    const { board, robberHexId } = buildFixed(4);
    const counts = countByTerrain(board);
    expect(counts.sea).toBeGreaterThanOrEqual(14);
    expect(counts.gold).toBe(2);
    expect(counts.brick).toBe(5);
    expect(counts.wood).toBe(5);
    expect(counts.sheep).toBe(5);
    expect(counts.wheat).toBe(5);
    expect(counts.ore).toBe(5);
    expect(counts.desert).toBe(1);
    expect(countNumbers(board)).toEqual({ 2: 2, 3: 3, 4: 3, 5: 3, 6: 3, 8: 3, 9: 3, 10: 3, 11: 3, 12: 1 });
    expect(board.ports).toHaveLength(9);
    expect(board.ports.filter((port) => port.ratio === 2)).toHaveLength(5);
    expect(board.ports.filter((port) => port.ratio === 3)).toHaveLength(4);
    expect(board.regions!.filter((region) => region.kind === "small-island")).toHaveLength(3);
    expect(board.hexes.find((hex) => hex.id === robberHexId)?.terrain).toBe("desert");
  });

  test("el modo variable es determinista y respeta las restricciones", () => {
    const first = buildVariable(4, 99);
    const second = buildVariable(4, 99);
    expect(first.board.hexes.map((hex) => `${hex.id}:${hex.terrain}:${hex.number}`)).toEqual(
      second.board.hexes.map((hex) => `${hex.id}:${hex.terrain}:${hex.number}`),
    );
    expect(hasAdjacentRedNumbers(first.board)).toBe(false);
    expect(countByTerrain(first.board)).toEqual(countByTerrain(buildFixed(4).board));
    expect(countNumbers(first.board)).toEqual(countNumbers(buildFixed(4).board));

    const variable3 = buildVariable(3, 5);
    expect(hasAdjacentRedNumbers(variable3.board)).toBe(false);
    expect(countByTerrain(variable3.board)).toEqual(countByTerrain(buildFixed(3).board));
  });

  test("todas las islas quedan conectadas por agua", () => {
    const directions: Array<[number, number]> = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];
    for (const built of [buildFixed(3), buildFixed(4)]) {
      const { board } = built;
      const byId = new Map(board.hexes.map((hex) => [hex.id, hex]));
      const seen = new Set<string>();
      const stack = [board.hexes[0]!.id];
      seen.add(board.hexes[0]!.id);
      while (stack.length > 0) {
        const hex = byId.get(stack.pop()!)!;
        for (const [dq, dr] of directions) {
          const neighborId = `h-${hex.q + dq}-${hex.r + dr}`;
          const neighbor = byId.get(neighborId);
          if (!neighbor || seen.has(neighbor.id)) continue;
          seen.add(neighbor.id);
          stack.push(neighbor.id);
        }
      }
      expect(seen.size).toBe(board.hexes.length);

      const land = board.hexes.filter((hex) => hex.terrain !== "sea");
      for (const hex of land) {
        const touchesWater = directions.some(([dq, dr]) => {
          const neighbor = byId.get(`h-${hex.q + dq}-${hex.r + dr}`);
          return neighbor?.terrain === "sea";
        });
        const isInterior =
          directions.every(([dq, dr]) => {
            const neighbor = byId.get(`h-${hex.q + dq}-${hex.r + dr}`);
            return neighbor !== undefined && neighbor.terrain !== "sea";
          }) && directions.every(([dq, dr]) => byId.has(`h-${hex.q + dq}-${hex.r + dr}`));
        expect(touchesWater || isInterior).toBe(true);
      }
    }
  });

  test("el pirata arranca en un hexágono de mar", () => {
    for (const built of [buildFixed(3), buildFixed(4), buildVariable(3), buildVariable(4)]) {
      expect(built.pirateHexId).not.toBeNull();
      const pirateHex = built.board.hexes.find((hex) => hex.id === built.pirateHexId);
      expect(pirateHex?.terrain).toBe("sea");
    }
  });
});

function setupScenarioGame(playerCount: 3 | 4, seed = 11): GameState {
  let state = createGame({
    players: playerConfigs(playerCount),
    seed: `${SCENARIO}-${seed}`,
    scenarioId: SCENARIO,
    setupMode: "fixed",
  });
  for (let placement = 0; placement < playerCount * 2; placement += 1) {
    const playerId = state.players[state.currentPlayerIndex]!.id;
    const legalVertices = getLegalSettlementPlacements(state, playerId);
    const coastal = legalVertices.find((vertexId) => {
      const vertex = state.board.vertices.find((candidate) => candidate.id === vertexId)!;
      return vertex.edgeIds.some((edgeId) => {
        const edge = state.board.edges.find((candidate) => candidate.id === edgeId)!;
        return edge.hexIds.some(
          (hexId) => state.board.hexes.find((hex) => hex.id === hexId)?.terrain === "sea",
        );
      });
    });
    const vertexId = coastal ?? legalVertices[0]!;
    state = applyAction(state, { type: "place-setup-settlement", playerId, vertexId });
    const roads = getLegalRoadPlacements(state, playerId);
    const ships = getLegalShipPlacements(state, playerId);
    const edgeId = roads[0] ?? ships[0]!;
    const kind = roads.includes(edgeId) ? "road" : "ship";
    state = applyAction(state, { type: "place-setup-road", playerId, edgeId, kind });
  }
  return state;
}

function toMain(state: GameState): GameState {
  return { ...state, phase: "main", hasRolled: true };
}

function withResources(
  state: GameState,
  resources: Record<string, Partial<Record<"wood" | "brick" | "sheep" | "wheat" | "ore", number>>>,
) {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      resources: { ...player.resources, ...(resources[player.id] ?? {}) },
    })),
  } as GameState;
}

describe("reglas de Navegantes en el escenario 1", () => {
  test("el setup termina con la isla principal y el umbral de victoria en 14", () => {
    const state = setupScenarioGame(4);
    expect(state.phase).toBe("awaiting-roll");
    expect(state.winThreshold).toBe(14);
    const mainRegion = state.board.regions!.find((region) => region.kind === "main")!;
    for (const player of state.players) {
      for (const vertexId of player.settlements) {
        const vertex = state.board.vertices.find((candidate) => candidate.id === vertexId)!;
        expect(vertex.hexIds.some((hexId) => mainRegion.hexIds.includes(hexId))).toBe(true);
      }
    }
  });

  test("se puede construir un barco y luego moverlo", () => {
    let state = setupScenarioGame(3);
    state = toMain(withResources(state, { p1: { wood: 5, sheep: 5, brick: 5 } }));

    const builder = state.players.find(
      (player) => getLegalShipPlacements(state, player.id).length > 0,
    );
    expect(builder).toBeDefined();
    const builderId = builder!.id;
    const shipEdgeId = getLegalShipPlacements(state, builderId)[0]!;
    state = applyAction(state, { type: "build-ship", playerId: builderId, edgeId: shipEdgeId });
    expect(state.players.find((player) => player.id === builderId)!.ships).toContain(shipEdgeId);
    expect(state.shipsBuiltThisTurn).toContain(shipEdgeId);

    const movedState: GameState = {
      ...state,
      shipsBuiltThisTurn: [],
      players: state.players.map((player) => ({ ...player, ships: [...player.ships] })),
    };
    const targets = getLegalShipMoveTargets(movedState, builderId, shipEdgeId);
    expect(targets.length).toBeGreaterThan(0);
    const moved = applyAction(movedState, {
      type: "move-ship",
      playerId: builderId,
      fromEdgeId: shipEdgeId,
      toEdgeId: targets[0]!,
    });
    expect(moved.players.find((player) => player.id === builderId)!.ships).not.toContain(shipEdgeId);
    expect(moved.players.find((player) => player.id === builderId)!.ships).toContain(targets[0]);
    expect(moved.movedShipThisTurn).toBe(true);
  });

  test("un 7 permite elegir entre el ladrón y el pirata, y el pirata roba por barco", () => {
    let state = setupScenarioGame(3);
    state = withResources(state, { p2: { wood: 3 } });

    const pirateHex = state.piratePosition?.kind === "hex" ? state.piratePosition.hexId : null;
    const targetEdge = state.board.edges.find(
      (edge) =>
        edge.hexIds.some((hexId) => {
          const hex = state.board.hexes.find((candidate) => candidate.id === hexId);
          return hex?.terrain === "sea" && hexId !== pirateHex;
        }),
    )!;
    const seaHexId = targetEdge.hexIds.find(
      (hexId) => state.board.hexes.find((hex) => hex.id === hexId)?.terrain === "sea",
    )!;
    expect(getPirateVictims(state, seaHexId, "p1")).toEqual([]);

    state = {
      ...state,
      phase: "activate",
      hasRolled: true,
      players: state.players.map((player, index) =>
        index === 1 ? { ...player, ships: [targetEdge.id] } : player,
      ),
    };
    const p1WoodBefore = state.players[0]!.resources.wood;
    const p2WoodBefore = state.players[1]!.resources.wood;
    state = applyAction(state, { type: "activate-pirate", playerId: "p1" });
    expect(state.phase).toBe("pirate");
    state = applyAction(state, { type: "move-pirate", playerId: "p1", hexId: seaHexId });
    expect(state.piratePosition).toEqual({ kind: "hex", hexId: seaHexId });
    expect(state.phase).toBe("main");
    expect(state.players[0]!.resources.wood).toBe(p1WoodBefore + 1);
    expect(state.players[1]!.resources.wood).toBe(p2WoodBefore - 1);
  });

  test("los campos de oro piden recurso a elección durante la producción", () => {
    const goldHex = buildFixed(3).board.hexes.find((hex) => hex.terrain === "gold")!;
    let found: GameState | null = null;
    outer: for (let seed = 1; seed <= 400; seed += 1) {
      const base = createGame({
        players: playerConfigs(3),
        seed: `gold-${seed}`,
        scenarioId: SCENARIO,
        setupMode: "fixed",
      });
      const vertex = base.board.vertices.find((candidate) =>
        candidate.hexIds.includes(goldHex.id),
      )!;
      const candidate: GameState = {
        ...base,
        phase: "awaiting-roll",
        turnNumber: 1,
        players: base.players.map((player, index) =>
          index === 0 ? { ...player, settlements: [vertex.id] } : player,
        ),
      };
      const rolled = applyAction(candidate, { type: "roll", playerId: "p1" });
      if (rolled.lastRoll?.total === goldHex.number && rolled.phase === "gold") {
        found = rolled;
        break outer;
      }
    }
    expect(found).not.toBeNull();
    const state = found!;
    expect(state.pendingGoldChoices.p1).toBe(1);
    const resolved = applyAction(state, { type: "choose-gold", playerId: "p1", resources: ["ore"] });
    expect(resolved.phase).toBe("main");
    expect(resolved.players[0]!.resources.ore).toBe(1);
  });

  test("el primer poblado en una isla pequeña otorga 2 PV extra por jugador", () => {
    const base = setupScenarioGame(3);
    const islandRegion = base.board.regions!.find((region) => region.kind === "small-island")!;
    const islandVertex = base.board.vertices.find(
      (vertex) =>
        vertex.hexIds.some((hexId) => islandRegion.hexIds.includes(hexId)) &&
        !vertex.adjacentVertexIds.some((neighborId) => {
          const neighbor = base.board.vertices.find((candidate) => candidate.id === neighborId)!;
          return base.players.some(
            (player) =>
              player.settlements.includes(neighbor.id) || player.cities.includes(neighbor.id),
          );
        }),
    )!;
    const edge = base.board.edges.find((candidate) => candidate.vertexIds.includes(islandVertex.id))!;
    const state: GameState = toMain(
      withResources(
        {
          ...base,
          players: base.players.map((player, index) =>
            index === 0 ? { ...player, ships: [edge.id] } : player,
          ),
        },
        { p1: { wood: 1, brick: 1, sheep: 1, wheat: 1 } },
      ),
    );
    const placed = applyAction(state, { type: "build-settlement", playerId: "p1", vertexId: islandVertex.id });
    expect(getBonusVictoryPoints(placed, "p1")).toBe(2);
    expect(placed.players[0]!.bonusVpTokens).toHaveLength(1);

    const refilled: GameState = {
      ...placed,
      players: placed.players.map((player, index) =>
        index === 0
          ? { ...player, resources: { ...player.resources, wood: 1, brick: 1, sheep: 1, wheat: 1 } }
          : player,
      ),
    };
    expect(() =>
      applyAction(refilled, {
        type: "build-settlement",
        playerId: "p1",
        vertexId: islandVertex.id,
      }),
    ).toThrow(/conectarse a un camino o barco y respetar la distancia/i);
  });
});
