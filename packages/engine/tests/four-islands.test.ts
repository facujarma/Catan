import { describe, expect, test } from "vitest";
import {
  applyAction,
  buildScenarioBoard,
  createGame,
  getBonusVictoryPoints,
  getLegalRoadPlacements,
  getLegalSettlementPlacements,
  getLegalShipPlacements,
  getScenarioDefinition,
  SeededRandom,
} from "../src";
import type { Board, GameState } from "../src/types";
import { playerConfigs } from "./helpers";

const SCENARIO = "four-islands";
const NE = "island-ne";
const NW = "island-nw";
const SW = "island-sw";
const SE = "island-se";

function buildFixed(playerCount: 3 | 4) {
  return buildScenarioBoard(SCENARIO, playerCount, "fixed", new SeededRandom(7));
}

function buildVariable(playerCount: 3 | 4, seed: number) {
  return buildScenarioBoard(SCENARIO, playerCount, "variable", new SeededRandom(seed));
}

function countByTerrain(board: Board): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const hex of board.hexes) counts[hex.terrain] = (counts[hex.terrain] ?? 0) + 1;
  return counts;
}

function countNumbers(board: Board): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const hex of board.hexes) {
    if (hex.number === null) continue;
    counts[hex.number] = (counts[hex.number] ?? 0) + 1;
  }
  return counts;
}

function hasAdjacentRedNumbers(board: Board): boolean {
  const byId = new Map(board.hexes.map((hex) => [hex.id, hex]));
  return board.hexes.some((hex) => {
    if (hex.number !== 6 && hex.number !== 8) return false;
    return hex.neighborHexIds.some((neighborId) => {
      const number = byId.get(neighborId)?.number;
      return number === 6 || number === 8;
    });
  });
}

function regionOf(board: Board, regionId: string) {
  const region = board.regions!.find((candidate) => candidate.id === regionId);
  if (!region) throw new Error(`No existe la región ${regionId}.`);
  return region;
}

function vertexInRegion(state: GameState, vertexId: string, regionId: string): boolean {
  const hexIds = new Set(regionOf(state.board, regionId).hexIds);
  const vertex = state.board.vertices.find((candidate) => candidate.id === vertexId)!;
  return vertex.hexIds.some((hexId) => hexIds.has(hexId));
}

// Un poblado inicial en la isla indicada, con el camino (o barco) que sale de él.
function placeStarting(state: GameState, playerId: string, regionId: string): GameState {
  expect(state.players[state.currentPlayerIndex]!.id).toBe(playerId);
  const vertexId = getLegalSettlementPlacements(state, playerId).find((candidate) =>
    vertexInRegion(state, candidate, regionId),
  );
  if (!vertexId) throw new Error(`Sin lugar inicial en ${regionId} para ${playerId}.`);
  const withSettlement = applyAction(state, {
    type: "place-setup-settlement",
    playerId,
    vertexId,
  });
  const roadId = getLegalRoadPlacements(withSettlement, playerId)[0];
  if (roadId) {
    return applyAction(withSettlement, {
      type: "place-setup-road",
      playerId,
      edgeId: roadId,
      kind: "road",
    });
  }
  const shipId = getLegalShipPlacements(withSettlement, playerId)[0]!;
  return applyAction(withSettlement, {
    type: "place-setup-road",
    playerId,
    edgeId: shipId,
    kind: "ship",
  });
}

function withResources(state: GameState, playerId: string, amount: number): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            resources: { wood: amount, brick: amount, sheep: amount, wheat: amount, ore: amount },
          }
        : player,
    ),
  };
}

// Construye un poblado en la isla indicada. Si ningún vértice está conectado todavía,
// agrega un camino propio que llegue al vértice y luego construye.
function buildIn(state: GameState, playerId: string, regionId: string): GameState {
  const candidates = state.board.vertices
    .filter((vertex) => vertexInRegion(state, vertex.id, regionId))
    .map((vertex) => vertex.id);
  const legal = getLegalSettlementPlacements(state, playerId);
  const direct = candidates.find((vertexId) => legal.includes(vertexId));
  if (direct) return applyAction(state, { type: "build-settlement", playerId, vertexId: direct });

  const occupied = new Set(state.players.flatMap((player) => [...player.roads, ...player.ships]));
  for (const vertexId of candidates) {
    const vertex = state.board.vertices.find((candidate) => candidate.id === vertexId)!;
    for (const edgeId of vertex.edgeIds) {
      if (occupied.has(edgeId)) continue;
      const connected: GameState = {
        ...state,
        players: state.players.map((player) =>
          player.id === playerId ? { ...player, roads: [...player.roads, edgeId] } : player,
        ),
      };
      if (getLegalSettlementPlacements(connected, playerId).includes(vertexId)) {
        return applyAction(connected, { type: "build-settlement", playerId, vertexId });
      }
    }
  }
  throw new Error(`No se pudo construir en ${regionId} para ${playerId}.`);
}

// Setup real: cada jugador funda sus dos poblados en las islas indicadas, en orden de turno.
function setupGame(
  seed: string,
  placements: Array<[string, string]>,
  playerCount: 3 | 4 = 3,
): GameState {
  let state = createGame({
    players: playerConfigs(playerCount),
    seed: `${SCENARIO}-${seed}`,
    scenarioId: SCENARIO,
    setupMode: "fixed",
  });
  for (const [playerId, regionId] of placements) {
    state = placeStarting(state, playerId, regionId);
  }
  return state;
}

// Setup de 3 jugadores: orden de turno p1, p2, p3, p3, p2, p1.
const SETUP_3P: Array<[string, string]> = [
  ["p1", NE],
  ["p2", SE],
  ["p3", SW],
  ["p3", SW],
  ["p2", SE],
  ["p1", NW],
];

function toMain(state: GameState): GameState {
  return { ...state, phase: "main", hasRolled: true, turnNumber: 3 };
}

describe("Las cuatro islas: mapa fijo", () => {
  test("3 jugadores coincide con la tabla oficial de hexágonos, fichas y puertos", () => {
    const { board, robberHexId, pirateHexId, winThreshold } = buildFixed(3);
    // 35 fichas del manual más las 2 casillas de agua centrales del marco.
    expect(board.hexes).toHaveLength(37);
    expect(countByTerrain(board)).toEqual({
      sea: 17,
      wheat: 4,
      sheep: 4,
      brick: 4,
      wood: 4,
      ore: 4,
    });
    expect(countNumbers(board)).toEqual({ 2: 1, 3: 2, 4: 2, 5: 3, 6: 2, 8: 2, 9: 3, 10: 2, 11: 2, 12: 1 });
    expect(board.hexes.find((hex) => hex.id === robberHexId)?.number).toBe(12);
    expect(pirateHexId).toBeNull();
    expect(winThreshold).toBe(13);
  });

  test("4 jugadores coincide con la tabla oficial de hexágonos, fichas y puertos", () => {
    const { board, robberHexId, pirateHexId, winThreshold } = buildFixed(4);
    // 35 fichas del manual más las 2 casillas de agua centrales del marco.
    expect(board.hexes).toHaveLength(37);
    expect(countByTerrain(board)).toEqual({
      sea: 14,
      wheat: 5,
      sheep: 5,
      brick: 4,
      wood: 5,
      ore: 4,
    });
    expect(countNumbers(board)).toEqual({ 2: 1, 3: 2, 4: 3, 5: 3, 6: 2, 8: 2, 9: 3, 10: 3, 11: 3, 12: 1 });
    expect(board.hexes.find((hex) => hex.id === robberHexId)?.number).toBe(12);
    expect(pirateHexId).toBeNull();
    expect(winThreshold).toBe(13);
  });

  test("la fila central tiene 3 casillas de agua a cada lado", () => {
    for (const playerCount of [3, 4] as const) {
      const { board } = buildFixed(playerCount);
      const centralRow = board.hexes.filter((hex) => hex.r === 0).sort((left, right) => left.q - right.q);
      expect(centralRow.map((hex) => hex.q)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
      expect(centralRow.slice(0, 3).every((hex) => hex.terrain === "sea")).toBe(true);
      expect(centralRow.slice(4).every((hex) => hex.terrain === "sea")).toBe(true);
    }

    // En 4 jugadores el centro de la fila es el 6 de madera.
    const { board } = buildFixed(4);
    const centralHex = board.hexes.find((hex) => hex.r === 0 && hex.q === 0)!;
    expect(centralHex.terrain).toBe("wood");
    expect(centralHex.number).toBe(6);
  });

  test("los puertos son 5 especiales (uno por recurso) y 4 genéricos, todos sobre costa", () => {
    for (const playerCount of [3, 4] as const) {
      const { board } = buildFixed(playerCount);
      expect(board.ports).toHaveLength(9);
      expect(board.ports.filter((port) => port.ratio === 2)).toHaveLength(5);
      expect(board.ports.filter((port) => port.ratio === 3 && port.type === "generic")).toHaveLength(4);
      expect(
        board.ports
          .filter((port) => port.ratio === 2)
          .map((port) => port.type)
          .sort(),
      ).toEqual(["brick", "ore", "sheep", "wheat", "wood"]);

      const hexById = new Map(board.hexes.map((hex) => [hex.id, hex]));
      for (const port of board.ports) {
        const edge = board.edges.find((candidate) => candidate.id === port.edgeId)!;
        const terrains = edge.hexIds.map((hexId) => hexById.get(hexId)!.terrain);
        expect(terrains.some((terrain) => terrain !== "sea")).toBe(true);
        expect(terrains.includes("sea") || edge.hexIds.length < 2).toBe(true);
      }
    }
  });

  test("cada isla es una región separada por mar, con 2 PV de bono y área de inicio", () => {
    const expectedSizes: Record<3 | 4, Record<string, number>> = {
      3: { [NE]: 6, [NW]: 4, [SW]: 6, [SE]: 4 },
      4: { [NE]: 8, [NW]: 4, [SW]: 7, [SE]: 4 },
    };
    for (const playerCount of [3, 4] as const) {
      const { board } = buildFixed(playerCount);
      const regions = board.regions!;
      expect(regions).toHaveLength(4);
      for (const region of regions) {
        expect(region.hexIds).toHaveLength(expectedSizes[playerCount][region.id]!);
        expect(region.bonusVp).toBe(2);
        expect(region.startingArea).toBe(true);
        expect(region.hexIds.every((hexId) => board.hexes.find((hex) => hex.id === hexId)?.terrain !== "sea")).toBe(true);

        // La región es una sola isla: se recorre por vecinos sin salir de ella.
        const members = new Set(region.hexIds);
        const seen = new Set([region.hexIds[0]!]);
        const stack = [region.hexIds[0]!];
        while (stack.length > 0) {
          const currentId = stack.pop()!;
          const hex = board.hexes.find((candidate) => candidate.id === currentId)!;
          for (const neighborId of hex.neighborHexIds) {
            if (!members.has(neighborId) || seen.has(neighborId)) continue;
            seen.add(neighborId);
            stack.push(neighborId);
          }
        }
        expect(seen.size).toBe(region.hexIds.length);
      }

      // Ninguna tierra de una isla toca tierra de otra.
      const islandOf = new Map<string, string>();
      for (const region of regions) for (const hexId of region.hexIds) islandOf.set(hexId, region.id);
      for (const hex of board.hexes) {
        const island = islandOf.get(hex.id);
        if (!island) continue;
        for (const neighborId of hex.neighborHexIds) {
          const other = islandOf.get(neighborId);
          if (other) expect(other).toBe(island);
        }
      }
    }
  });

  test("el pirata empieza en el marco y el ladrón en el hexágono del 12", () => {
    const state = setupGame("marco", []);
    expect(state.piratePosition).toEqual({ kind: "frame" });
    expect(state.board.hexes.find((hex) => hex.id === state.robberHexId)?.number).toBe(12);
  });

  test("el pirata sale del marco hacia un hexágono de mar y puede volver al marco", () => {
    const state = setupGame("pirata", []);
    const seaHex = state.board.hexes.find((hex) => hex.terrain === "sea")!;
    const active: GameState = { ...toMain(state), phase: "pirate" };
    const moved = applyAction(active, { type: "move-pirate", playerId: "p1", hexId: seaHex.id });
    expect(moved.piratePosition).toEqual({ kind: "hex", hexId: seaHex.id });
    const back = applyAction({ ...moved, phase: "pirate" }, { type: "move-pirate", playerId: "p1", hexId: null });
    expect(back.piratePosition).toEqual({ kind: "frame" });
  });
});

describe("Las cuatro islas: setup variable", () => {
  test("mantiene los conteos oficiales, el ladrón en el 12 y el pirata en el marco", () => {
    const fixed = { 3: buildFixed(3).board, 4: buildFixed(4).board };
    for (const playerCount of [3, 4] as const) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const built = buildVariable(playerCount, seed);
        expect(countByTerrain(built.board)).toEqual(countByTerrain(fixed[playerCount]));
        expect(countNumbers(built.board)).toEqual(countNumbers(fixed[playerCount]));
        expect(built.board.ports.map((port) => `${port.type}-${port.ratio}`).sort()).toEqual(
          fixed[playerCount].ports.map((port) => `${port.type}-${port.ratio}`).sort(),
        );
        expect(built.board.hexes.find((hex) => hex.id === built.robberHexId)?.number).toBe(12);
        expect(built.pirateHexId).toBeNull();
      }
    }
  });

  test("bosques y pastos no reciben 2, 3, 11 ni 12", () => {
    for (const playerCount of [3, 4] as const) {
      for (let seed = 1; seed <= 60; seed += 1) {
        const { board } = buildVariable(playerCount, seed);
        for (const hex of board.hexes) {
          if (hex.terrain !== "wood" && hex.terrain !== "sheep") continue;
          expect([2, 3, 11, 12]).not.toContain(hex.number);
        }
      }
    }
  });

  test("los números rojos (6 y 8) nunca quedan contiguos", () => {
    for (const playerCount of [3, 4] as const) {
      for (let seed = 1; seed <= 60; seed += 1) {
        expect(hasAdjacentRedNumbers(buildVariable(playerCount, seed).board)).toBe(false);
      }
    }
  });

  test("es determinista por semilla", () => {
    const first = buildVariable(4, 99);
    const second = buildVariable(4, 99);
    expect(first.board.hexes.map((hex) => `${hex.id}:${hex.terrain}:${hex.number}`)).toEqual(
      second.board.hexes.map((hex) => `${hex.id}:${hex.terrain}:${hex.number}`),
    );
  });

  test("la definición declara 3 y 4 jugadores", () => {
    const definition = getScenarioDefinition(SCENARIO)!;
    expect(definition.name).toBe("Las cuatro islas");
    expect(Object.keys(definition.variants).sort()).toEqual(["3", "4"]);
  });
});

describe("Las cuatro islas: islas natales y bono de primer poblado", () => {
  test("los poblados iniciales definen las islas natales y no dan bono", () => {
    const state = setupGame("natales", SETUP_3P);
    expect(state.phase).toBe("awaiting-roll");
    const home = Object.fromEntries(state.players.map((player) => [player.id, player.homeRegionIds]));
    expect(home).toEqual({ p1: [NE, NW], p2: [SE], p3: [SW] });
    expect(state.players.every((player) => player.bonusVpTokens.length === 0)).toBe(true);
  });

  test("construir en una isla natal no da bono; en cada isla extraña, 2 PV una sola vez", () => {
    let state = toMain(setupGame("bono", SETUP_3P));
    state = withResources(state, "p1", 5);

    state = buildIn(state, "p1", NE);
    expect(getBonusVictoryPoints(state, "p1")).toBe(0);

    state = buildIn(state, "p1", SE);
    expect(getBonusVictoryPoints(state, "p1")).toBe(2);
    expect(state.players[0]!.bonusVpTokens).toEqual([
      expect.objectContaining({ regionId: SE, amount: 2 }),
    ]);

    // Una segunda construcción en la misma isla no suma otra vez.
    state = withResources(state, "p1", 5);
    state = buildIn(state, "p1", SE);
    expect(getBonusVictoryPoints(state, "p1")).toBe(2);
  });

  test("el bono de una isla extraña no depende de que otro jugador ya construya allí", () => {
    let state = toMain(setupGame("compartida", SETUP_3P));
    // p2 ya fundó dos poblados en la isla sureste.
    expect(state.players[1]!.settlements.every((vertexId) => vertexInRegion(state, vertexId, SE))).toBe(true);

    state = withResources(state, "p1", 5);
    state = buildIn(state, "p1", SE);
    expect(getBonusVictoryPoints(state, "p1")).toBe(2);
  });

  test("con dos islas natales, una tercera isla extraña suma 2 PV y la cuarta también", () => {
    let state = toMain(setupGame("cuatro", SETUP_3P));
    state = withResources(state, "p1", 5);
    state = buildIn(state, "p1", SE);
    state = withResources(state, "p1", 5);
    state = buildIn(state, "p1", SW);
    expect(getBonusVictoryPoints(state, "p1")).toBe(4);
    expect(state.players[0]!.bonusVpTokens.map((token) => token.regionId).sort()).toEqual([SE, SW].sort());
  });

  test("el setup admite fundar en cualquier isla y en la misma dos veces", () => {
    const state = setupGame("libre", [
      ["p1", SW],
      ["p2", NE],
      ["p3", NW],
      ["p3", NW],
      ["p2", SE],
      ["p1", SW],
    ]);
    expect(state.players.map((player) => player.homeRegionIds)).toEqual([[SW], [NE, SE], [NW]]);
    expect(state.players.every((player) => player.bonusVpTokens.length === 0)).toBe(true);
  });
});
