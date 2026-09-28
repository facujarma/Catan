import { describe, expect, it } from "vitest";
import { applyAction, createGame, EngineError } from "../src";
import type { GameAction, ResourceBundle } from "../src/types";
import { bundle, mainState, playerConfigs } from "./helpers";

describe("estado y transiciones de turno", () => {
  it("crea el mazo oficial de 25 cartas de desarrollo", () => {
    const state = createGame({ players: playerConfigs(), seed: "deck" });
    const counts = new Map<string, number>();
    for (const card of state.developmentDeck) {
      counts.set(card.type, (counts.get(card.type) ?? 0) + 1);
    }

    expect(state.developmentDeck).toHaveLength(25);
    expect(counts.get("knight")).toBe(14);
    expect(counts.get("victory-point")).toBe(5);
    expect(counts.get("road-building")).toBe(2);
    expect(counts.get("year-of-plenty")).toBe(2);
    expect(counts.get("monopoly")).toBe(2);
  });

  it("valida el rango de 3 a 4 jugadores", () => {
    expect(() => createGame({ players: playerConfigs(2), seed: 1 })).toThrow(/entre 3 y 4/i);
    expect(() => createGame({ players: playerConfigs(5), seed: 1 })).toThrow(/entre 3 y 4/i);
  });

  it("pasa al siguiente jugador y reinicia los indicadores del turno", () => {
    const state = mainState();
    state.playedDevelopmentCardThisTurn = true;

    const next = applyAction(state, { type: "end-turn", playerId: "p1" });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toBe("awaiting-roll");
    expect(next.turnNumber).toBe(state.turnNumber + 1);
    expect(next.playedDevelopmentCardThisTurn).toBe(false);
  });

  it("rechaza recursos desconocidos en acciones recibidas en runtime", () => {
    const state = mainState();
    state.players[0]!.developmentCards = [
      { id: "monopoly-1", type: "monopoly", boughtOnTurn: 2 },
    ];
    const invalidAction = {
      type: "play-monopoly",
      playerId: "p1",
      cardId: "monopoly-1",
      resource: "gold",
    } as unknown as GameAction;

    expect(() => applyAction(state, invalidAction)).toThrowError(
      expect.objectContaining<Partial<EngineError>>({ code: "INVALID_RESOURCE" }),
    );
  });

  it("rechaza bundles con claves desconocidas", () => {
    const state = mainState();
    state.players[0]!.resources = bundle({ wood: 1 });
    const invalidBundle = { ...bundle({ wood: 1 }), gold: 1 } as ResourceBundle;
    const invalidAction = {
      type: "make-offer",
      playerId: "p1",
      give: invalidBundle,
      want: bundle({ ore: 1 }),
    } satisfies GameAction;

    expect(() => applyAction(state, invalidAction)).toThrow(/tipo de recurso desconocido/i);
  });
});
