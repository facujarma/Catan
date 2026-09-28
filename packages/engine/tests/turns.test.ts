import { describe, expect, it } from "vitest";
import { applyAction, getRobberVictims, totalResources } from "../src";
import { bundle, findSeedForRoll, findStateWithRollOnHex, mainState, setResource } from "./helpers";

describe("dados, producción y ladrón", () => {
  it("reparte producción por poblados y duplica la producción de ciudades", () => {
    const { state: initial, hexId, total } = findStateWithRollOnHex();
    const hex = initial.board.hexes.find((candidate) => candidate.id === hexId)!;
    if (hex.terrain === "desert") throw new Error("La tirada no puede producir desierto.");
    const [firstVertex, secondVertex] = initial.board.vertices.filter((vertex) =>
      vertex.hexIds.includes(hexId),
    );
    expect(firstVertex).toBeDefined();
    expect(secondVertex).toBeDefined();

    const state = {
      ...initial,
      players: initial.players.map((player, index) => ({
        ...player,
        cities: index === 1 ? [secondVertex!.id] : player.cities,
        settlements: index === 0 ? [firstVertex!.id] : index === 1 ? [] : player.settlements,
      })),
    };
    const next = applyAction(state, { type: "roll", playerId: "p1" });

    expect(next.lastRoll?.total).toBe(total);
    expect(next.players[0]!.resources[hex.terrain as keyof typeof next.players[0]["resources"]]).toBe(1);
    expect(next.players[1]!.resources[hex.terrain as keyof typeof next.players[1]["resources"]]).toBe(2);
    expect(next.phase).toBe("main");
  });

  it("no entrega ningún recurso de un tipo si el banco no alcanza para todos", () => {
    const { state: initial, hexId } = findStateWithRollOnHex();
    const hex = initial.board.hexes.find((candidate) => candidate.id === hexId)!;
    if (hex.terrain === "desert") throw new Error("La tirada no puede producir desierto.");
    const vertex = initial.board.vertices.find((candidate) => candidate.hexIds.includes(hexId))!;
    const state = {
      ...initial,
      bank: { ...initial.bank, [hex.terrain]: 1 },
      players: initial.players.map((player, index) => ({
        ...player,
        cities: index === 0 ? [vertex.id] : player.cities,
      })),
    };

    const next = applyAction(state, { type: "roll", playerId: "p1" });
    expect(next.players[0]!.resources[hex.terrain as keyof typeof next.players[0]["resources"]]).toBe(0);
    expect(next.bank[hex.terrain as keyof typeof next.bank]).toBe(1);
  });

  it("con el 7 descarta la mitad por jugador y mueve el ladrón con robo aleatorio", () => {
    const initial = findSeedForRoll(7);
    const robberTarget = initial.board.hexes.find((hex) => hex.id !== initial.robberHexId)!;
    const victimVertex = initial.board.vertices.find((vertex) => vertex.hexIds.includes(robberTarget.id))!;
    const prepared = {
      ...initial,
      players: initial.players.map((player, index) => ({
        ...player,
        resources:
          index === 0
            ? bundle({ wood: 9 })
            : index === 1
              ? bundle({ brick: 8 })
              : index === 2
                ? bundle({ ore: 1 })
                : bundle(),
        settlements: index === 2 ? [victimVertex.id] : player.settlements,
      })),
    };

    let state = applyAction(prepared, { type: "roll", playerId: "p1" });
    expect(state.lastRoll?.total).toBe(7);
    expect(state.phase).toBe("discard");
    expect(state.pendingDiscards).toEqual({ p1: 4, p2: 4 });

    state = applyAction(state, {
      type: "discard",
      playerId: "p1",
      resources: bundle({ wood: 4 }),
    });
    expect(state.phase).toBe("discard");
    state = applyAction(state, {
      type: "discard",
      playerId: "p2",
      resources: bundle({ brick: 4 }),
    });
    expect(state.phase).toBe("robber");
    expect(state.pendingDiscards).toEqual({});

    const next = applyAction(state, {
      type: "move-robber",
      playerId: "p1",
      hexId: robberTarget.id,
      victimId: "p3",
    });
    expect(next.phase).toBe("main");
    expect(next.robberHexId).toBe(robberTarget.id);
    expect(totalResources(next.players[0]!.resources)).toBe(6);
    expect(totalResources(next.players[2]!.resources)).toBe(0);
  });

  it("requiere descartar exactamente la mitad y no acepta cartas inexistentes", () => {
    const initial = findSeedForRoll(7);
    const state = {
      ...initial,
      players: initial.players.map((player, index) => ({
        ...player,
        resources: index === 0 ? bundle({ wood: 8 }) : bundle(),
      })),
    };
    const rolled = applyAction(state, { type: "roll", playerId: "p1" });
    expect(rolled.phase).toBe("discard");
    expect(() =>
      applyAction(rolled, {
        type: "discard",
        playerId: "p1",
        resources: bundle({ wood: 3 }),
      }),
    ).toThrow(/exactamente 4/);
    expect(() =>
      applyAction(rolled, {
        type: "discard",
        playerId: "p1",
        resources: bundle({ brick: 4 }),
      }),
    ).toThrow(/no podés descartar/i);
  });

  it("informa las víctimas posibles del ladrón excluyendo al jugador activo y a quien no tiene cartas", () => {
    const state = mainState(321);
    const hex = state.board.hexes.find((candidate) => candidate.id !== state.robberHexId)!;
    const vertices = state.board.vertices.filter((vertex) => vertex.hexIds.includes(hex.id));
    expect(vertices.length).toBeGreaterThanOrEqual(3);

    state.players[0]!.settlements = [vertices[0]!.id];
    state.players[0]!.resources = bundle({ wood: 2 });
    state.players[1]!.cities = [vertices[1]!.id];
    state.players[1]!.resources = bundle({ ore: 1 });
    state.players[2]!.settlements = [vertices[2]!.id];
    state.players[2]!.resources = bundle();

    expect(getRobberVictims(state, hex.id, "p1")).toEqual(["p2"]);
    expect(getRobberVictims(state, hex.id, "p3").sort()).toEqual(["p1", "p2"]);
  });

  it("no modifica el estado de entrada cuando calcula una tirada", () => {
    const initial = findSeedForRoll(6);
    setResource(initial, 0, "wood", 2);
    const snapshot = structuredClone(initial);
    const next = applyAction(initial, { type: "roll", playerId: "p1" });

    expect(initial).toEqual(snapshot);
    expect(next).not.toBe(initial);
  });
});
