import { describe, expect, it } from "vitest";
import {
  applyAction,
  getLegalRoadPlacements,
  getLegalSettlementPlacements,
  getMaritimeTradeRatio,
  getPublicVictoryPoints,
} from "../src";
import { bundle, mainState } from "./helpers";

function findTwoRoadRoute(state: ReturnType<typeof mainState>) {
  for (const start of state.board.vertices) {
    for (const firstEdgeId of start.edgeIds) {
      const firstEdge = state.board.edges.find((edge) => edge.id === firstEdgeId)!;
      const middleId = firstEdge.vertexIds.find((vertexId) => vertexId !== start.id)!;
      const middle = state.board.vertices.find((vertex) => vertex.id === middleId)!;
      for (const secondEdgeId of middle.edgeIds) {
        if (secondEdgeId === firstEdgeId) continue;
        const secondEdge = state.board.edges.find((edge) => edge.id === secondEdgeId)!;
        const endId = secondEdge.vertexIds.find((vertexId) => vertexId !== middleId)!;
        if (!start.adjacentVertexIds.includes(endId)) {
          return { startId: start.id, endId, firstEdgeId, secondEdgeId };
        }
      }
    }
  }
  throw new Error("No se encontró una ruta de dos caminos que permita construir un poblado.");
}

describe("construcción", () => {
  it("cobra el coste de un camino y respeta la conexión a la red", () => {
    const state = mainState();
    const edge = state.board.edges[0]!;
    state.players[0]!.settlements = [edge.vertexIds[0]];
    state.players[0]!.resources = bundle({ wood: 1, brick: 1 });
    expect(getLegalRoadPlacements(state, "p1")).toContain(edge.id);

    const next = applyAction(state, { type: "build-road", playerId: "p1", edgeId: edge.id });
    expect(next.players[0]!.roads).toContain(edge.id);
    expect(next.players[0]!.resources).toEqual(bundle());
    expect(next.bank.wood).toBe(state.bank.wood + 1);
    expect(next.bank.brick).toBe(state.bank.brick + 1);
    expect(state.players[0]!.roads).toHaveLength(0);
  });

  it("construye un poblado conectado y prohíbe asentarse junto a otro", () => {
    const state = mainState();
    const route = findTwoRoadRoute(state);
    state.players[0]!.settlements = [route.startId];
    state.players[0]!.roads = [route.firstEdgeId, route.secondEdgeId];
    state.players[0]!.resources = bundle({ wood: 1, brick: 1, sheep: 1, wheat: 1 });

    expect(getLegalSettlementPlacements(state, "p1")).toContain(route.endId);
    const next = applyAction(state, {
      type: "build-settlement",
      playerId: "p1",
      vertexId: route.endId,
    });
    expect(next.players[0]!.settlements).toContain(route.endId);
    expect(next.players[0]!.resources).toEqual(bundle());

    next.players[0]!.resources = bundle({ wood: 1, brick: 1, sheep: 1, wheat: 1 });
    const adjacentToNew = state.board.vertices.find((vertex) =>
      vertex.adjacentVertexIds.includes(route.endId),
    )!;
    expect(() =>
      applyAction(next, {
        type: "build-settlement",
        playerId: "p1",
        vertexId: adjacentToNew.id,
      }),
    ).toThrow(/conectarse a un camino y respetar la distancia/i);
  });

  it("mejora un poblado a ciudad al coste correcto y actualiza los puntos", () => {
    const state = mainState();
    const vertexId = state.board.vertices[0]!.id;
    state.players[0]!.settlements = [vertexId];
    state.players[0]!.resources = bundle({ ore: 3, wheat: 2 });

    const next = applyAction(state, { type: "build-city", playerId: "p1", vertexId });
    expect(next.players[0]!.settlements).toEqual([]);
    expect(next.players[0]!.cities).toEqual([vertexId]);
    expect(next.players[0]!.resources).toEqual(bundle());
    expect(getPublicVictoryPoints(state, "p1")).toBe(1);
    expect(getPublicVictoryPoints(next, "p1")).toBe(2);
  });

  it("rechaza construir si faltan recursos sin alterar la partida", () => {
    const state = mainState();
    const edge = state.board.edges[0]!;
    state.players[0]!.settlements = [edge.vertexIds[0]];
    state.players[0]!.resources = bundle({ wood: 1 });
    expect(() =>
      applyAction(state, { type: "build-road", playerId: "p1", edgeId: edge.id }),
    ).toThrow(/faltan recursos/i);
    expect(state.players[0]!.resources).toEqual(bundle({ wood: 1 }));
  });
});

describe("comercio", () => {
  it("permite una oferta global, varias aceptaciones y que el oferente elija socio", () => {
    let state = mainState();
    state.players[0]!.resources = bundle({ wheat: 2 });
    state.players[1]!.resources = bundle({ wood: 2 });
    state.players[2]!.resources = bundle({ wood: 3 });

    state = applyAction(state, {
      type: "make-offer",
      playerId: "p1",
      give: bundle({ wheat: 1 }),
      want: bundle({ wood: 1 }),
    });
    expect(state.phase).toBe("trade");
    expect(state.activeTrade?.fromPlayerId).toBe("p1");
    expect(state.activeTrade?.acceptedBy).toEqual([]);

    state = applyAction(state, { type: "accept-offer", playerId: "p2" });
    state = applyAction(state, { type: "accept-offer", playerId: "p3" });
    expect(state.activeTrade?.acceptedBy).toEqual(["p2", "p3"]);

    expect(() =>
      applyAction(state, { type: "confirm-offer", playerId: "p1", partnerId: "p4" }),
    ).toThrow(/no aceptó/i);

    state = applyAction(state, {
      type: "confirm-offer",
      playerId: "p1",
      partnerId: "p3",
    });
    expect(state.phase).toBe("main");
    expect(state.activeTrade).toBeNull();
    expect(state.players[0]!.resources).toEqual(bundle({ wheat: 1, wood: 1 }));
    expect(state.players[2]!.resources).toEqual(bundle({ wood: 2, wheat: 1 }));
  });

  it("registra rechazos, permite cambiar de opinión y cancelar la oferta", () => {
    let state = mainState();
    state.players[0]!.resources = bundle({ wheat: 1 });
    state.players[1]!.resources = bundle({ wood: 1 });

    state = applyAction(state, {
      type: "make-offer",
      playerId: "p1",
      give: bundle({ wheat: 1 }),
      want: bundle({ wood: 1 }),
    });
    state = applyAction(state, { type: "reject-offer", playerId: "p2" });
    expect(state.activeTrade?.rejectedBy).toEqual(["p2"]);
    expect(state.activeTrade?.acceptedBy).toEqual([]);

    state = applyAction(state, { type: "accept-offer", playerId: "p2" });
    expect(state.activeTrade?.acceptedBy).toEqual(["p2"]);
    expect(state.activeTrade?.rejectedBy).toEqual([]);

    expect(() =>
      applyAction(state, { type: "cancel-offer", playerId: "p2" }),
    ).toThrow(/quien ofertó/i);

    state = applyAction(state, { type: "cancel-offer", playerId: "p1" });
    expect(state.phase).toBe("main");
    expect(state.activeTrade).toBeNull();
  });

  it("rechaza aceptar una oferta que no se puede pagar y cerrarla sin aceptación", () => {
    let state = mainState();
    state.players[0]!.resources = bundle({ wheat: 1 });
    state.players[1]!.resources = bundle({ wood: 1 });

    state = applyAction(state, {
      type: "make-offer",
      playerId: "p1",
      give: bundle({ wheat: 1 }),
      want: bundle({ wood: 2 }),
    });
    expect(() =>
      applyAction(state, { type: "accept-offer", playerId: "p2" }),
    ).toThrow(/recursos que pide/i);
    expect(() =>
      applyAction(state, { type: "confirm-offer", playerId: "p1", partnerId: "p2" }),
    ).toThrow(/no aceptó/i);
  });

  it("la contraoferta reemplaza la oferta global y la responde cualquier jugador", () => {
    let state = mainState();
    state.players[0]!.resources = bundle({ wheat: 2 });
    state.players[1]!.resources = bundle({ wood: 2 });

    state = applyAction(state, {
      type: "make-offer",
      playerId: "p1",
      give: bundle({ wheat: 1 }),
      want: bundle({ wood: 2 }),
    });
    state = applyAction(state, {
      type: "counter-offer",
      playerId: "p2",
      give: bundle({ wood: 1 }),
      want: bundle({ wheat: 2 }),
    });
    expect(state.activeTrade?.fromPlayerId).toBe("p2");
    expect(state.activeTrade?.acceptedBy).toEqual([]);

    state = applyAction(state, { type: "accept-offer", playerId: "p1" });
    expect(state.activeTrade?.acceptedBy).toEqual(["p1"]);

    state = applyAction(state, {
      type: "confirm-offer",
      playerId: "p2",
      partnerId: "p1",
    });
    expect(state.phase).toBe("main");
    expect(state.players[0]!.resources).toEqual(bundle({ wheat: 0, wood: 1 }));
    expect(state.players[1]!.resources).toEqual(bundle({ wood: 1, wheat: 2 }));
  });

  it("aplica tasas marítimas 4:1, 3:1 y 2:1 según los puertos", () => {
    let state = mainState();
    const specificPort = state.board.ports.find((port) => port.type === "wood")!;
    const genericPort = state.board.ports.find((port) => port.type === "generic")!;
    state.players[0]!.settlements = [specificPort.vertexIds[0]];
    state.players[0]!.resources = bundle({ wood: 2, brick: 3, ore: 4 });

    expect(getMaritimeTradeRatio(state, "p1", "wood")).toBe(2);
    expect(getMaritimeTradeRatio(state, "p1", "brick")).toBe(4);
    expect(getMaritimeTradeRatio(state, "p1", "ore")).toBe(4);

    state.players[0]!.settlements.push(genericPort.vertexIds[0]);
    expect(getMaritimeTradeRatio(state, "p1", "brick")).toBe(3);
    state = applyAction(state, {
      type: "maritime-trade",
      playerId: "p1",
      giveResource: "wood",
      giveAmount: 2,
      receiveResource: "ore",
    });
    expect(state.players[0]!.resources).toEqual(bundle({ wood: 0, brick: 3, ore: 5 }));

    state = applyAction(state, {
      type: "maritime-trade",
      playerId: "p1",
      giveResource: "brick",
      giveAmount: 3,
      receiveResource: "sheep",
    });
    expect(state.players[0]!.resources).toEqual(
      bundle({ wood: 0, brick: 0, sheep: 1, ore: 5 }),
    );
  });

  it("rechaza intercambios con cantidades que no respetan la tasa", () => {
    const state = mainState();
    state.players[0]!.resources = bundle({ brick: 2 });
    expect(() =>
      applyAction(state, {
        type: "maritime-trade",
        playerId: "p1",
        giveResource: "brick",
        giveAmount: 2,
        receiveResource: "wood",
      }),
    ).toThrow(/múltiplo de 4:1/i);
  });
});
