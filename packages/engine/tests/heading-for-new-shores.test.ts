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
  getMovableShipIds,
  getPirateVictims,
  SeededRandom,
} from "../src";
import type { Edge, GameState, Vertex } from "../src/types";
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
    state = {
      ...state,
      players: state.players.map((player, index) =>
        index === 1
          ? {
              ...player,
              resources: { wood: 3, brick: 0, sheep: 0, wheat: 0, ore: 0 },
            }
          : player,
      ),
    };

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

describe("costas contra el marco", () => {
  test("en Navegantes se puede construir un barco en una costa contra el marco", () => {
    const base = createGame({
      players: playerConfigs(3),
      seed: "marco-navegantes",
      scenarioId: SCENARIO,
      setupMode: "fixed",
    });
    const borderEdge = base.board.edges.find(
      (edge) =>
        edge.hexIds.length === 1 &&
        base.board.hexes.find((hex) => hex.id === edge.hexIds[0])?.terrain !== "sea",
    );
    expect(borderEdge).toBeDefined();
    const vertexId = borderEdge!.vertexIds[0];
    const state: GameState = {
      ...base,
      phase: "main",
      hasRolled: true,
      turnNumber: 3,
      players: base.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              settlements: [vertexId],
              resources: { wood: 3, brick: 3, sheep: 3, wheat: 3, ore: 3 },
            }
          : player,
      ),
    };

    expect(getLegalShipPlacements(state, "p1")).toContain(borderEdge!.id);
    const built = applyAction(state, {
      type: "build-ship",
      playerId: "p1",
      edgeId: borderEdge!.id,
    });
    expect(built.players[0]!.ships).toContain(borderEdge!.id);
  });

  test("en Catan base los barcos no estan disponibles", () => {
    const base = createGame({ players: playerConfigs(3), seed: "marco-base" });
    const borderEdge = base.board.edges.find((edge) => edge.hexIds.length === 1)!;
    const state: GameState = {
      ...base,
      phase: "main",
      hasRolled: true,
      turnNumber: 3,
      players: base.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              settlements: [borderEdge.vertexIds[0]],
              resources: { wood: 3, brick: 3, sheep: 3, wheat: 3, ore: 3 },
            }
          : player,
      ),
    };
    expect(getLegalShipPlacements(state, "p1")).toEqual([]);
    expect(() =>
      applyAction(state, { type: "build-ship", playerId: "p1", edgeId: borderEdge.id }),
    ).toThrow();
  });
});

describe("movimiento de barcos", () => {
  test("no se puede mover un barco usando su propia arista como conexion", () => {
    const state = toMain(setupScenarioGame(3));
    const player = state.players[0]!;
    const edgeById = new Map(state.board.edges.map((edge) => [edge.id, edge]));
    const vertexById = new Map(state.board.vertices.map((vertex) => [vertex.id, vertex]));
    const isWater = (edgeId: string): boolean => {
      const edge = edgeById.get(edgeId)!;
      return (
        edge.hexIds.some(
          (hexId) => state.board.hexes.find((hex) => hex.id === hexId)?.terrain === "sea",
        ) || edge.hexIds.length < 2
      );
    };

    let found: { a: string; b: string; c: string; d: string } | null = null;
    for (const settlementVertexId of player.settlements) {
      const settlementVertex = vertexById.get(settlementVertexId)!;
      for (const aId of settlementVertex.edgeIds.filter(isWater)) {
        const a = edgeById.get(aId)!;
        const v1 = a.vertexIds.find((id) => id !== settlementVertexId)!;
        for (const bId of vertexById.get(v1)!.edgeIds.filter((id) => id !== aId && isWater(id))) {
          const b = edgeById.get(bId)!;
          const v2 = b.vertexIds.find((id) => id !== v1)!;
          for (const cId of vertexById.get(v2)!.edgeIds.filter((id) => id !== bId && isWater(id))) {
            const c = edgeById.get(cId)!;
            if (c.vertexIds.some((id) => a.vertexIds.includes(id))) continue;
            const d = settlementVertex.edgeIds.find((id) => {
              if (id === aId || id === bId || !isWater(id)) return false;
              const edge = edgeById.get(id)!;
              return !edge.vertexIds.some((vid) => b.vertexIds.includes(vid));
            });
            if (!d) continue;
            found = { a: aId, b: bId, c: cId, d };
            break;
          }
          if (found) break;
        }
        if (found) break;
      }
      if (found) break;
    }
    expect(found).not.toBeNull();
    const { a, b, c, d } = found!;

    const stateWithShips: GameState = {
      ...state,
      movedShipThisTurn: false,
      shipsBuiltThisTurn: [],
      players: state.players.map((candidate, index) =>
        index === 0 ? { ...candidate, ships: [a, b] } : candidate,
      ),
    };

    const targets = getLegalShipMoveTargets(stateWithShips, "p1", b);
    expect(targets).not.toContain(c);
    expect(targets).toContain(d);

    expect(() =>
      applyAction(stateWithShips, {
        type: "move-ship",
        playerId: "p1",
        fromEdgeId: b,
        toEdgeId: c,
      }),
    ).toThrow(/conectado a tu red/i);

    const moved = applyAction(stateWithShips, {
      type: "move-ship",
      playerId: "p1",
      fromEdgeId: b,
      toEdgeId: d,
    });
    expect(moved.players[0]!.ships).toContain(d);
    expect(moved.players[0]!.ships).not.toContain(b);
  });
});

describe("opcion sin oro en la isla principal", () => {
  test("en setup variable el oro solo cae en islas no principales", () => {
    for (const playerCount of [3, 4] as const) {
      const built = buildScenarioBoard(SCENARIO, playerCount, "variable", new SeededRandom(123), {
        mainIslandNoGold: true,
      });
      const mainRegion = built.board.regions!.find((region) => region.kind === "main")!;
      const mainHexIds = new Set(mainRegion.hexIds);
      const golds = built.board.hexes.filter((hex) => hex.terrain === "gold");
      expect(golds).toHaveLength(2);
      for (const gold of golds) {
        expect(mainHexIds.has(gold.id)).toBe(false);
      }
      expect(countByTerrain(built.board)).toEqual(countByTerrain(buildFixed(playerCount).board));

      const again = buildScenarioBoard(SCENARIO, playerCount, "variable", new SeededRandom(123), {
        mainIslandNoGold: true,
      });
      expect(again.board.hexes.map((hex) => `${hex.id}:${hex.terrain}`)).toEqual(
        built.board.hexes.map((hex) => `${hex.id}:${hex.terrain}`),
      );
    }
  });
});

describe("poblados en agua", () => {
  test("no se puede construir un poblado en un vertice rodeado solo de agua", () => {
    const state = toMain(setupScenarioGame(3));
    const waterVertex = state.board.vertices.find((vertex) =>
      vertex.hexIds.every(
        (hexId) => state.board.hexes.find((hex) => hex.id === hexId)?.terrain === "sea",
      ),
    );
    expect(waterVertex).toBeDefined();
    const edge = state.board.edges.find((candidate) =>
      candidate.vertexIds.includes(waterVertex!.id),
    )!;
    const withShip: GameState = {
      ...state,
      players: state.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              ships: [edge.id],
              resources: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
            }
          : player,
      ),
    };

    expect(getLegalSettlementPlacements(withShip, "p1")).not.toContain(waterVertex!.id);
    expect(() =>
      applyAction(withShip, {
        type: "build-settlement",
        playerId: "p1",
        vertexId: waterVertex!.id,
      }),
    ).toThrow();
  });
});

describe("ramas de barcos", () => {
  test("la punta de una rama de una ruta cerrada se puede mover; el tramo interior no", () => {
    const state = toMain(setupScenarioGame(3));
    const vertexById = new Map<string, Vertex>(
      state.board.vertices.map((vertex) => [vertex.id, vertex]),
    );
    const edgeById = new Map<string, Edge>(
      state.board.edges.map((edge) => [edge.id, edge]),
    );
    const isWater = (edgeId: string) => {
      const edge = edgeById.get(edgeId)!;
      return (
        edge.hexIds.some(
          (hexId) => state.board.hexes.find((hex) => hex.id === hexId)?.terrain === "sea",
        ) || edge.hexIds.length < 2
      );
    };
    const neighbors = (vertexId: string, exclude: string[] = []): Edge[] =>
      vertexById
        .get(vertexId)!
        .edgeIds.map((id) => edgeById.get(id)!)
        .filter((edge) => !exclude.includes(edge.id) && isWater(edge.id));

    const v0 = state.board.vertices.find((vertex) =>
      vertex.edgeIds.some((id) => isWater(id)),
    )!;
    const e1 = neighbors(v0.id)[0]!;
    const v1 = e1.vertexIds.find((id) => id !== v0.id)!;
    const e2 = neighbors(v1, [e1.id])[0]!;
    const v2 = e2.vertexIds.find((id) => id !== v1)!;
    const e3 = neighbors(v2, [e2.id])[0]!;
    const v3 = e3.vertexIds.find((id) => id !== v2)!;
    const e4 = neighbors(v3, [e3.id])[0]!;
    const v4 = e4.vertexIds.find((id) => id !== v3)!;
    const b1 = neighbors(v2, [e2.id, e3.id])[0]!;
    const vb1 = b1.vertexIds.find((id) => id !== v2)!;
    const b2 = neighbors(vb1, [b1.id])[0]!;

    const withNetwork: GameState = {
      ...toMain(state),
      players: state.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              settlements: [v0.id, v4],
              ships: [e1.id, e2.id, e3.id, e4.id, b1.id, b2.id],
            }
          : player,
      ),
    };

    const movable = new Set(getMovableShipIds(withNetwork, "p1"));
    expect(movable.has(b2.id)).toBe(true);
    expect(movable.has(b1.id)).toBe(false);
    expect(movable.has(e1.id)).toBe(false);
    expect(movable.has(e2.id)).toBe(false);
  });
});
