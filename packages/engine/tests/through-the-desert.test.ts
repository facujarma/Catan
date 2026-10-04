import { describe, expect, test } from "vitest";
import {
  applyAction,
  buildScenarioBoard,
  createGame,
  getBonusVictoryPoints,
  getLegalSettlementPlacements,
  SeededRandom,
  vertexTouchesStartingArea,
} from "../src";
import type { GameState } from "../src/types";
import { playerConfigs } from "./helpers";

const SCENARIO = "through-the-desert";

function buildFixed(playerCount: 3 | 4 = 3) {
  return buildScenarioBoard(SCENARIO, playerCount, "fixed", new SeededRandom(7));
}

function buildVariable(playerCount: 3 | 4 = 3, seed = 42) {
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

function expectCoastalPorts(board: ReturnType<typeof buildFixed>["board"]): void {
  for (const port of board.ports) {
    const edge = board.edges.find((candidate) => candidate.id === port.edgeId)!;
    const touchesWater =
      edge.hexIds.length < 2 ||
      edge.hexIds.some(
        (hexId) => board.hexes.find((hex) => hex.id === hexId)?.terrain === "sea",
      );
    expect(touchesWater).toBe(true);
  }
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

describe("escenario 4: A través del desierto (3 jugadores)", () => {
  test("el mapa fijo coincide con la tabla del manual", () => {
    const { board, winThreshold, robberHexId, pirateHexId } = buildFixed(3);
    expect(countByTerrain(board)).toEqual({
      sea: 12,
      desert: 3,
      gold: 2,
      wood: 5,
      brick: 3,
      ore: 4,
      sheep: 4,
      wheat: 4,
    });
    expect(countNumbers(board)).toEqual({
      2: 1,
      3: 2,
      4: 3,
      5: 3,
      6: 3,
      8: 3,
      9: 3,
      10: 2,
      11: 1,
      12: 1,
    });
    expect(board.hexes.filter((hex) => hex.terrain !== "sea")).toHaveLength(25);
    expect(winThreshold).toBe(14);

    const regions = board.regions!;
    expect(regions.find((region) => region.id === "main")!.hexIds).toHaveLength(17);
    expect(regions.find((region) => region.id === "strip")!.hexIds).toHaveLength(3);
    expect(regions.find((region) => region.id === "island-a")!.hexIds).toHaveLength(2);
    expect(regions.find((region) => region.id === "island-b")!.hexIds).toHaveLength(1);
    expect(regions.find((region) => region.id === "island-c")!.hexIds).toHaveLength(2);
    expect(regions.find((region) => region.id === "main")!.startingArea).toBe(true);
    expect(
      regions.filter((region) => region.bonusVp === 2).every((region) => !region.startingArea),
    ).toBe(true);

    expect(board.hexes.find((hex) => hex.id === robberHexId)?.terrain).toBe("desert");
    expect(robberHexId).toBe("h-0--2");
    expect(board.hexes.find((hex) => hex.id === pirateHexId)?.terrain).toBe("sea");
    expect(pirateHexId).toBe("h-2--2");

    expect(board.ports).toHaveLength(8);
    expect(board.ports.filter((port) => port.ratio === 2)).toHaveLength(5);
    expect(board.ports.filter((port) => port.ratio === 3)).toHaveLength(3);
    expect(
      board.ports
        .filter((port) => port.type !== "generic")
        .map((port) => port.type)
        .sort(),
    ).toEqual(["brick", "ore", "sheep", "wheat", "wood"]);
    expectCoastalPorts(board);
  });

  test("el setup solo permite poblados iniciales en la isla principal", () => {
    const state = createGame({
      players: playerConfigs(3),
      seed: "desert-setup",
      scenarioId: SCENARIO,
      setupMode: "fixed",
    });
    const legal = getLegalSettlementPlacements(state, "p1");
    expect(legal.length).toBeGreaterThan(0);
    for (const vertexId of legal) {
      expect(vertexTouchesStartingArea(state, vertexId)).toBe(true);
    }
    const islandHexIds = new Set(
      state.board.regions!
        .filter((region) => region.id !== "main")
        .flatMap((region) => region.hexIds),
    );
    const islandOnlyVertex = state.board.vertices.find((vertex) =>
      vertex.hexIds.every((hexId) => islandHexIds.has(hexId)),
    );
    if (islandOnlyVertex) {
      expect(legal).not.toContain(islandOnlyVertex.id);
    }
  });

  test("el mapa fijo de 4 jugadores coincide con la tabla del manual", () => {
    const { board, winThreshold, robberHexId, pirateHexId } = buildFixed(4);
    expect(countByTerrain(board)).toEqual({
      sea: 14,
      desert: 3,
      gold: 2,
      wood: 5,
      brick: 5,
      ore: 5,
      sheep: 5,
      wheat: 5,
    });
    expect(countNumbers(board)).toEqual({
      2: 1,
      3: 3,
      4: 3,
      5: 3,
      6: 3,
      8: 3,
      9: 3,
      10: 3,
      11: 3,
      12: 2,
    });
    expect(board.hexes.filter((hex) => hex.terrain !== "sea")).toHaveLength(30);
    expect(winThreshold).toBe(14);

    const regions = board.regions!;
    expect(regions.find((region) => region.id === "main")!.hexIds).toHaveLength(20);
    expect(regions.find((region) => region.id === "strip")!.hexIds).toHaveLength(3);
    expect(regions.find((region) => region.id === "island-a")!.hexIds).toHaveLength(3);
    expect(regions.find((region) => region.id === "island-b")!.hexIds).toHaveLength(2);
    expect(regions.find((region) => region.id === "island-c")!.hexIds).toHaveLength(2);

    expect(robberHexId).toBe("h--1--2");
    expect(board.hexes.find((hex) => hex.id === robberHexId)?.terrain).toBe("desert");
    expect(pirateHexId).toBe("h-3-0");
    expect(board.hexes.find((hex) => hex.id === pirateHexId)?.terrain).toBe("sea");
    expect(board.ports).toHaveLength(9);
    expect(board.ports.filter((port) => port.ratio === 2)).toHaveLength(5);
    expect(board.ports.filter((port) => port.ratio === 3)).toHaveLength(4);
    expectCoastalPorts(board);
  });
});

describe("reglas de A través del desierto", () => {
  test("el primer poblado en una isla extranjera otorga 2 PV extra", () => {
    const base = createGame({
      players: playerConfigs(3),
      seed: "desert-bonus",
      scenarioId: SCENARIO,
      setupMode: "fixed",
    });
    const islandRegion = base.board.regions!.find((region) => region.id === "island-a")!;
    const islandHexById = new Map(base.board.hexes.map((hex) => [hex.id, hex]));
    const onlyIslandLand = (hexId: string): boolean => {
      const hex = islandHexById.get(hexId);
      return !hex || hex.terrain === "sea" || islandRegion.hexIds.includes(hexId);
    };
    const islandVertex = base.board.vertices.find(
      (vertex) =>
        vertex.hexIds.some((hexId) => islandRegion.hexIds.includes(hexId)) &&
        vertex.hexIds.every(onlyIslandLand) &&
        !vertex.adjacentVertexIds.some((neighborId) => {
          const neighbor = base.board.vertices.find((candidate) => candidate.id === neighborId)!;
          return base.players.some(
            (player) =>
              player.settlements.includes(neighbor.id) || player.cities.includes(neighbor.id),
          );
        }),
    )!;
    const edge = base.board.edges.find((candidate) =>
      candidate.vertexIds.includes(islandVertex.id),
    )!;
    const state: GameState = {
      ...base,
      phase: "main",
      hasRolled: true,
      turnNumber: 3,
      players: base.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              ships: [edge.id],
              resources: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
            }
          : player,
      ),
    };

    const placed = applyAction(state, {
      type: "build-settlement",
      playerId: "p1",
      vertexId: islandVertex.id,
    });
    expect(getBonusVictoryPoints(placed, "p1")).toBe(2);
    expect(placed.players[0]!.bonusVpTokens).toHaveLength(1);

    const islandVertex2 = placed.board.vertices.find(
      (vertex) =>
        vertex.hexIds.some((hexId) => islandRegion.hexIds.includes(hexId)) &&
        vertex.hexIds.every(onlyIslandLand) &&
        vertex.id !== islandVertex.id &&
        !vertex.adjacentVertexIds.some((neighborId) => {
          const neighbor = placed.board.vertices.find(
            (candidate) => candidate.id === neighborId,
          )!;
          return placed.players.some(
            (player) =>
              player.settlements.includes(neighbor.id) || player.cities.includes(neighbor.id),
          );
        }),
    )!;
    const edge2 = placed.board.edges.find((candidate) =>
      candidate.vertexIds.includes(islandVertex2.id),
    )!;
    const refilled: GameState = {
      ...placed,
      players: placed.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              ships: [...player.ships, edge2.id],
              resources: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
            }
          : player,
      ),
    };
    const second = applyAction(refilled, {
      type: "build-settlement",
      playerId: "p1",
      vertexId: islandVertex2.id,
    });
    expect(getBonusVictoryPoints(second, "p1")).toBe(2);
    expect(second.players[0]!.bonusVpTokens).toHaveLength(1);
  });

  test("el modo variable es determinista y respeta las restricciones", () => {
    for (const playerCount of [3, 4] as const) {
      const first = buildVariable(playerCount, 99);
      const second = buildVariable(playerCount, 99);
      expect(first.board.hexes.map((hex) => `${hex.id}:${hex.terrain}:${hex.number}`)).toEqual(
        second.board.hexes.map((hex) => `${hex.id}:${hex.terrain}:${hex.number}`),
      );
      expect(hasAdjacentRedNumbers(first.board)).toBe(false);
      expect(countByTerrain(first.board)).toEqual(countByTerrain(buildFixed(playerCount).board));
      expect(countNumbers(first.board)).toEqual(countNumbers(buildFixed(playerCount).board));
    }
    const deserts = buildVariable(3, 99).board.hexes.filter((hex) => hex.terrain === "desert");
    expect(deserts.map((hex) => hex.id).sort()).toEqual(["h--1--1", "h-0--2", "h-1--3"]);
  });
});
