import { describe, expect, it } from "vitest";
import {
  calculateLongestRoad,
  getPlayerView,
  getPublicVictoryPoints,
  getVictoryPoints,
  recalculateAwards,
} from "../src";
import { mainState, findSimplePath } from "./helpers";

describe("puntuación", () => {
  it("cuenta caminos sin reutilizar aristas y corta el recorrido en poblados rivales", () => {
    const state = mainState();
    const path = findSimplePath(state, 5);
    state.players[0]!.roads = path.edgeIds;

    expect(calculateLongestRoad(state, "p1")).toBe(5);
    expect(
      getPlayerView(state, "p1").players.find((player) => player.id === "p1")?.longestRoadLength,
    ).toBe(5);
    recalculateAwards(state);
    expect(state.longestRoadHolderId).toBe("p1");
    expect(getPublicVictoryPoints(state, "p1")).toBe(2);

    state.players[1]!.settlements = [path.vertexIds[2]!];
    expect(calculateLongestRoad(state, "p1")).toBe(3);
    recalculateAwards(state);
    expect(state.longestRoadHolderId).toBeNull();
  });

  it("respeta umbral y desempate del ejército más grande", () => {
    const state = mainState();
    state.players[0]!.playedKnights = 3;
    state.players[1]!.playedKnights = 3;
    recalculateAwards(state);
    expect(state.largestArmyHolderId).toBeNull();

    state.largestArmyHolderId = "p1";
    recalculateAwards(state);
    expect(state.largestArmyHolderId).toBe("p1");

    state.players[1]!.playedKnights = 4;
    recalculateAwards(state);
    expect(state.largestArmyHolderId).toBe("p2");
  });

  it("acumula estadísticas de tiradas y cartas compradas y las expone al terminar", () => {
    const state = mainState();
    expect(getPlayerView(state, "p1").stats).toBeNull();

    state.players[0]!.boughtDevelopmentCards = ["knight", "knight", "victory-point"];
    state.players[1]!.boughtDevelopmentCards = ["monopoly"];
    state.rollHistory = [3, 7, 3, 11, 7, 12];
    state.phase = "finished";
    state.winnerId = "p1";

    const view = getPlayerView(state, "p1");
    expect(view.stats).not.toBeNull();
    const countFor = (total: number) =>
      view.stats!.rollCounts.find((entry) => entry.total === total)?.count;
    expect(countFor(3)).toBe(2);
    expect(countFor(7)).toBe(2);
    expect(countFor(12)).toBe(1);
    expect(countFor(5)).toBe(0);
    expect(view.stats!.developmentCardsBought["p1"]).toEqual([
      { type: "knight", count: 2 },
      { type: "victory-point", count: 1 },
    ]);
    expect(view.stats!.developmentCardsBought["p2"]).toEqual([{ type: "monopoly", count: 1 }]);
    expect(view.stats!.developmentCardsBought["p3"]).toEqual([]);
  });

  it("suma puntos ocultos solo para el dueño y filtra la vista por jugador", () => {
    const state = mainState();
    state.players[0]!.settlements = [state.board.vertices[0]!.id];
    state.players[0]!.developmentCards = [
      { id: "vp-private", type: "victory-point", boughtOnTurn: 1 },
      { id: "knight-private", type: "knight", boughtOnTurn: 2 },
    ];
    state.players[1]!.resources.ore = 4;
    state.players[1]!.developmentCards = [
      { id: "other-vp", type: "victory-point", boughtOnTurn: 1 },
    ];

    expect(getPublicVictoryPoints(state, "p1")).toBe(1);
    expect(getVictoryPoints(state, "p1")).toBe(2);

    const view = getPlayerView(state, "p1");
    const rivalView = view.players.find((player) => player.id === "p2")!;
    expect(view.self.resources).toEqual(state.players[0]!.resources);
    expect(view.self.hiddenVictoryPoints).toBe(1);
    expect(view.self.developmentCards.map((card) => card.type)).toEqual([
      "victory-point",
      "knight",
    ]);
    expect(rivalView.resourceCardCount).toBe(4);
    expect(rivalView.developmentCardCount).toBe(1);
    expect(rivalView.publicVictoryPoints).toBe(0);
    expect(rivalView).not.toHaveProperty("resources");
    expect(rivalView).not.toHaveProperty("developmentCards");
    expect(view).not.toHaveProperty("developmentDeck");
    expect(view).not.toHaveProperty("rngState");
    expect(view.bank).toEqual(state.bank);
  });
});
