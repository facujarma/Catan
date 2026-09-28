import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  EngineError,
  getCurrentPlayerId,
  getLegalRoadPlacements,
  getLegalSettlementPlacements,
  totalResources,
} from "../src";
import { playerConfigs } from "./helpers";

function completeSetup(playerCount: 3 | 4) {
  let state = createGame({ players: playerConfigs(playerCount), seed: "setup-test" });
  const placementOrder: string[] = [];
  const secondSettlementResourceGains = new Map<string, number>();

  for (let placement = 0; placement < playerCount * 2; placement += 1) {
    const playerId = getCurrentPlayerId(state);
    placementOrder.push(playerId);
    const legalVertices = getLegalSettlementPlacements(state, playerId);
    expect(legalVertices.length).toBeGreaterThan(0);
    const chosenVertex =
      state.setupIndex >= playerCount
        ? legalVertices.find((vertexId) =>
            state.board.vertices
              .find((vertex) => vertex.id === vertexId)!
              .hexIds.some(
                (hexId) =>
                  state.board.hexes.find((hex) => hex.id === hexId)!.terrain !== "desert",
              ),
          )!
        : legalVertices[0]!;

    const before = totalResources(state.players.find((player) => player.id === playerId)!.resources);
    state = applyAction(state, {
      type: "place-setup-settlement",
      playerId,
      vertexId: chosenVertex,
    });
    const after = totalResources(state.players.find((player) => player.id === playerId)!.resources);
    if (placement >= playerCount) secondSettlementResourceGains.set(playerId, after - before);

    const legalRoads = getLegalRoadPlacements(state, playerId);
    expect(legalRoads.length).toBeGreaterThan(0);
    state = applyAction(state, {
      type: "place-setup-road",
      playerId,
      edgeId: legalRoads[0]!,
    });
  }

  return { state, placementOrder, secondSettlementResourceGains };
}

describe("setup en serpiente", () => {
  it("ordena 4 jugadores ida y vuelta y entrega recursos del segundo poblado", () => {
    const { state, placementOrder, secondSettlementResourceGains } = completeSetup(4);

    expect(placementOrder).toEqual(["p1", "p2", "p3", "p4", "p4", "p3", "p2", "p1"]);
    expect([...secondSettlementResourceGains.values()].every((amount) => amount > 0)).toBe(true);
    for (const player of state.players) {
      expect(player.settlements).toHaveLength(2);
      expect(player.roads).toHaveLength(2);
    }
    expect(state.phase).toBe("awaiting-roll");
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.turnNumber).toBe(1);
  });

  it("también soporta 3 jugadores con la misma serpiente", () => {
    const { state, placementOrder } = completeSetup(3);
    expect(placementOrder).toEqual(["p1", "p2", "p3", "p3", "p2", "p1"]);
    expect(state.phase).toBe("awaiting-roll");
    expect(state.players.every((player) => player.roads.length === 2)).toBe(true);
  });

  it("rechaza poblados adyacentes y mantiene el estado original si una acción falla", () => {
    let state = createGame({ players: playerConfigs(), seed: 77 });
    const firstPlayer = getCurrentPlayerId(state);
    const firstVertex = getLegalSettlementPlacements(state, firstPlayer)[0]!;
    state = applyAction(state, {
      type: "place-setup-settlement",
      playerId: firstPlayer,
      vertexId: firstVertex,
    });
    state = applyAction(state, {
      type: "place-setup-road",
      playerId: firstPlayer,
      edgeId: getLegalRoadPlacements(state, firstPlayer)[0]!,
    });

    const secondPlayer = getCurrentPlayerId(state);
    const adjacentVertex = state.board.vertices.find((vertex) =>
      vertex.adjacentVertexIds.includes(firstVertex),
    )!;
    expect(() =>
      applyAction(state, {
        type: "place-setup-settlement",
        playerId: secondPlayer,
        vertexId: adjacentVertex.id,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<EngineError>>({ code: "ILLEGAL_PLACEMENT" }),
    );
    expect(state.phase).toBe("setup-settlement");
    expect(state.players[1]!.settlements).toHaveLength(0);
  });

  it("rechaza acciones de setup de un jugador que no está activo", () => {
    const state = createGame({ players: playerConfigs(), seed: 18 });
    expect(() =>
      applyAction(state, {
        type: "place-setup-settlement",
        playerId: "p2",
        vertexId: state.board.vertices[0]!.id,
      }),
    ).toThrowError(expect.objectContaining<Partial<EngineError>>({ code: "NOT_YOUR_TURN" }));
  });
});
