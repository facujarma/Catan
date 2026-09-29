import { describe, expect, it } from "vitest";
import {
  applyAction,
  getLegalRoadPlacements,
  getPublicVictoryPoints,
  getVictoryPoints,
  totalResources,
} from "../src";
import { bundle, mainState } from "./helpers";

describe("cartas de desarrollo", () => {
  it("compra del mazo y no permite jugar la carta en el mismo turno", () => {
    const state = mainState();
    state.players[0]!.resources = bundle({ sheep: 1, wheat: 1, ore: 1 });
    state.developmentDeck = [{ id: "knight-test", type: "knight" }];

    const next = applyAction(state, { type: "buy-development-card", playerId: "p1" });
    expect(next.developmentDeck).toHaveLength(0);
    expect(next.players[0]!.developmentCards).toEqual([
      { id: "knight-test", type: "knight", boughtOnTurn: 3 },
    ]);
    expect(next.players[0]!.resources).toEqual(bundle());

    expect(() =>
      applyAction(next, {
        type: "play-knight",
        playerId: "p1",
        cardId: "knight-test",
      }),
    ).toThrow(/comprada este turno/i);
  });

  it("monopolio toma de todos los rivales solo el recurso elegido", () => {
    const state = mainState();
    state.players[0]!.developmentCards = [
      { id: "monopoly-1", type: "monopoly", boughtOnTurn: 2 },
    ];
    state.players[1]!.resources = bundle({ sheep: 3, ore: 1 });
    state.players[2]!.resources = bundle({ sheep: 2 });
    state.players[3]!.resources = bundle({ sheep: 1 });

    const next = applyAction(state, {
      type: "play-monopoly",
      playerId: "p1",
      cardId: "monopoly-1",
      resource: "sheep",
    });
    expect(next.players[0]!.resources.sheep).toBe(6);
    expect(next.players[1]!.resources).toEqual(bundle({ ore: 1 }));
    expect(next.players[2]!.resources).toEqual(bundle());
    expect(next.players[3]!.resources).toEqual(bundle());
    expect(next.bank.sheep).toBe(state.bank.sheep);
    expect(next.players[0]!.developmentCards).toHaveLength(0);
  });

  it("año de la abundancia obtiene hasta dos cartas del banco", () => {
    const state = mainState();
    state.players[0]!.developmentCards = [
      { id: "plenty-1", type: "year-of-plenty", boughtOnTurn: 2 },
    ];

    const next = applyAction(state, {
      type: "play-year-of-plenty",
      playerId: "p1",
      cardId: "plenty-1",
      resources: ["wood", "brick"],
    });
    expect(next.players[0]!.resources).toEqual(bundle({ wood: 1, brick: 1 }));
    expect(next.bank.wood).toBe(state.bank.wood - 1);
    expect(next.bank.brick).toBe(state.bank.brick - 1);
  });

  it("toma una sola carta de abundancia cuando queda una en el banco", () => {
    const state = mainState();
    state.players[0]!.developmentCards = [
      { id: "plenty-last", type: "year-of-plenty", boughtOnTurn: 2 },
    ];
    state.bank = bundle({ ore: 1 });

    const next = applyAction(state, {
      type: "play-year-of-plenty",
      playerId: "p1",
      cardId: "plenty-last",
      resources: ["ore"],
    });
    expect(next.players[0]!.resources.ore).toBe(1);
    expect(next.bank.ore).toBe(0);
  });

  it("caballero mueve el ladrón, roba y actualiza el ejército más grande", () => {
    const state = mainState();
    const targetHex = state.board.hexes.find((hex) => hex.id !== state.robberHexId)!;
    const victimVertex = state.board.vertices.find((vertex) =>
      vertex.hexIds.includes(targetHex.id),
    )!;
    state.players[0]!.developmentCards = [
      { id: "knight-3", type: "knight", boughtOnTurn: 2 },
    ];
    state.players[0]!.playedKnights = 2;
    state.players[1]!.settlements = [victimVertex.id];
    state.players[1]!.resources = bundle({ brick: 2 });

    const played = applyAction(state, {
      type: "play-knight",
      playerId: "p1",
      cardId: "knight-3",
    });
    expect(played.phase).toBe("robber");
    expect(played.players[0]!.playedKnights).toBe(3);
    expect(played.largestArmyHolderId).toBe("p1");
    expect(getPublicVictoryPoints(played, "p1")).toBe(2);

    const next = applyAction(played, {
      type: "move-robber",
      playerId: "p1",
      hexId: targetHex.id,
      victimId: "p2",
    });
    expect(next.robberHexId).toBe(targetHex.id);
    expect(next.phase).toBe("main");
    expect(totalResources(next.players[0]!.resources)).toBe(1);
    expect(totalResources(next.players[1]!.resources)).toBe(1);
  });

  it("construcción de caminos coloca dos caminos gratis y conectados", () => {
    const state = mainState();
    const startVertex = state.board.vertices[0]!;
    const firstEdge = state.board.edges.find((edge) => edge.vertexIds.includes(startVertex.id))!;
    const nextVertexId = firstEdge.vertexIds.find((vertexId) => vertexId !== startVertex.id)!;
    const secondEdge = state.board.edges.find(
      (edge) => edge.id !== firstEdge.id && edge.vertexIds.includes(nextVertexId),
    )!;
    state.players[0]!.settlements = [startVertex.id];
    state.players[0]!.developmentCards = [
      { id: "roads-1", type: "road-building", boughtOnTurn: 2 },
    ];

    expect(getLegalRoadPlacements(state, "p1")).toEqual([]);
    expect(getLegalRoadPlacements(state, "p1", { free: true })).toContain(firstEdge.id);
    const next = applyAction(state, {
      type: "play-road-building",
      playerId: "p1",
      cardId: "roads-1",
      edgeIds: [firstEdge.id, secondEdge.id],
    });
    expect(next.players[0]!.roads).toEqual([firstEdge.id, secondEdge.id]);
    expect(next.players[0]!.resources).toEqual(bundle());
    expect(next.playedDevelopmentCardThisTurn).toBe(true);
  });

  it("no permite jugar más de una carta de desarrollo en el mismo turno", () => {
    let state = mainState();
    state.players[0]!.developmentCards = [
      { id: "monopoly-1", type: "monopoly", boughtOnTurn: 2 },
      { id: "plenty-1", type: "year-of-plenty", boughtOnTurn: 2 },
    ];
    state = applyAction(state, {
      type: "play-monopoly",
      playerId: "p1",
      cardId: "monopoly-1",
      resource: "ore",
    });

    expect(() =>
      applyAction(state, {
        type: "play-year-of-plenty",
        playerId: "p1",
        cardId: "plenty-1",
        resources: ["wood"],
      }),
    ).toThrow(/una carta de desarrollo por turno/i);
  });

  it("cuenta puntos de victoria ocultos y termina al llegar a diez", () => {
    const state = mainState();
    state.players[0]!.settlements = state.board.vertices.slice(0, 9).map((vertex) => vertex.id);
    state.players[0]!.resources = bundle({ sheep: 1, wheat: 1, ore: 1 });
    state.developmentDeck = [{ id: "vp-1", type: "victory-point" }];

    expect(getPublicVictoryPoints(state, "p1")).toBe(9);
    const next = applyAction(state, { type: "buy-development-card", playerId: "p1" });
    expect(getVictoryPoints(next, "p1")).toBe(10);
    expect(next.winnerId).toBe("p1");
    expect(next.phase).toBe("finished");
  });
});
