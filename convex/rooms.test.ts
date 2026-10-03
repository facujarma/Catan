/// <reference types="vite/client" />
import type { GameAction, GameState } from "@catan/engine";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

type RemovePlayerId<T> = T extends { playerId: string } ? Omit<T, "playerId"> : never;
type ActionPayload = RemovePlayerId<GameAction>;

const modules = import.meta.glob("./**/*.ts");

const HOST = {
  playerId: "host-player-0000000000000000",
  playerToken: "host-token-00000000000000000000000000000000",
  name: "Host",
};
const CODE = "ABCD";

type TestClient = ReturnType<typeof convexTest>;

afterEach(() => {
  vi.useRealTimers();
});

async function createRoom(t: TestClient): Promise<void> {
  await t.mutation(api.rooms.createRoom, { code: CODE, ...HOST });
}

async function startRoomWithBots(
  t: TestClient,
  options: { bots?: number; limit?: number } = {},
): Promise<void> {
  await createRoom(t);
  const bots = options.bots ?? 2;
  for (let index = 0; index < bots; index += 1) {
    await t.mutation(api.rooms.addBot, { code: CODE, playerToken: HOST.playerToken });
  }
  if (options.limit !== undefined) {
    await t.mutation(api.rooms.setTurnTimeLimit, {
      code: CODE,
      playerToken: HOST.playerToken,
      seconds: options.limit,
    });
  }
  await t.mutation(api.rooms.setReady, {
    code: CODE,
    playerToken: HOST.playerToken,
    ready: true,
  });
  await startGameWithoutShuffle(t);
}

async function startGameWithoutShuffle(t: TestClient): Promise<void> {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.999999);
  try {
    await t.mutation(api.rooms.startGame, { code: CODE, playerToken: HOST.playerToken });
  } finally {
    random.mockRestore();
  }
}

const EMPTY_LEGAL = {
  settlementVertexIds: [],
  roadIds: [],
  freeRoadIds: [],
  shipIds: [],
  freeShipIds: [],
  movableShipIds: [],
  shipMoveTargets: {},
  pirateTargetHexIds: [],
  cityVertexIds: [],
  tradeRatios: { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 },
  robberHexIds: [],
};

async function rawRoom(t: TestClient) {
  return await t.query(api.rooms.getRoom, { code: CODE, playerToken: HOST.playerToken });
}

async function snapshot(t: TestClient) {
  const room = await rawRoom(t);
  if (!room) throw new Error("La sala de prueba no existe.");
  const presence = await t.query(api.rooms.getPresence, { roomId: room.roomId });
  const game = room.gameId
    ? await t.query(api.rooms.getGame, { gameId: room.gameId })
    : null;
  const board = room.boardId
    ? await t.query(api.rooms.getBoard, { boardId: room.boardId })
    : null;
  const self = await t.query(api.rooms.getSelf, {
    roomId: room.roomId,
    playerToken: HOST.playerToken,
  });
  const onlineIds = new Set(presence);
  return {
    ...room,
    players: room.players.map((player) => ({
      ...player,
      online: player.isBot || onlineIds.has(player.id),
    })),
    turnDeadlineAt: game?.turnDeadlineAt ?? null,
    tradeRespondDeadlineAt: game?.tradeRespondDeadlineAt ?? null,
    pausedAt: game?.pausedAt ?? null,
    pauseRemainingMs: game?.pauseRemainingMs ?? null,
    pauseRequest: game?.pauseRequest ?? null,
    turnStats: game?.turnStats ?? {},
    game: game && board && self ? { ...game.view, board, self: self.view } : null,
    legal: self?.legal ?? EMPTY_LEGAL,
  };
}

async function act(t: TestClient, action: ActionPayload): Promise<void> {
  await t.mutation(api.rooms.applyGameAction, {
    code: CODE,
    playerToken: HOST.playerToken,
    action,
  });
}

async function advanceBotActions(t: TestClient, steps: number): Promise<void> {
  for (let step = 0; step < steps; step += 1) {
    vi.advanceTimersByTime(5_100);
    await t.finishInProgressScheduledFunctions();
  }
}

async function placeHostSetup(t: TestClient): Promise<void> {
  const room = await snapshot(t);
  const vertexId = room.legal.settlementVertexIds[0];
  if (!vertexId) throw new Error("No hay vértices legales para el poblado inicial.");
  await act(t, { type: "place-setup-settlement", vertexId });
  const afterSettlement = await snapshot(t);
  const edgeId = afterSettlement.legal.roadIds[0];
  if (!edgeId) throw new Error("No hay caminos legales para el camino inicial.");
  await act(t, { type: "place-setup-road", edgeId });
}

describe("bots", () => {
  test("el anfitrión agrega bots listos y la sala arranca", async () => {
    const t = convexTest(schema, modules);
    await createRoom(t);
    await t.mutation(api.rooms.addBot, { code: CODE, playerToken: HOST.playerToken });
    await t.mutation(api.rooms.addBot, { code: CODE, playerToken: HOST.playerToken });

    let room = await snapshot(t);
    expect(room.players.filter((player) => player.isBot)).toHaveLength(2);
    expect(room.players.filter((player) => player.isBot).every((player) => player.ready)).toBe(true);
    expect(room.players.every((player) => player.online)).toBe(true);

    await t.mutation(api.rooms.setReady, {
      code: CODE,
      playerToken: HOST.playerToken,
      ready: true,
    });
    await startGameWithoutShuffle(t);
    room = await snapshot(t);
    expect(room.status).toBe("playing");
    expect(room.game?.players).toHaveLength(3);
  });

  test("el orden de turnos se sortea al iniciar la partida", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await createRoom(t);
    const firstBot = await t.mutation(api.rooms.addBot, {
      code: CODE,
      playerToken: HOST.playerToken,
    });
    const secondBot = await t.mutation(api.rooms.addBot, {
      code: CODE,
      playerToken: HOST.playerToken,
    });
    await t.mutation(api.rooms.setReady, {
      code: CODE,
      playerToken: HOST.playerToken,
      ready: true,
    });

    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      await t.mutation(api.rooms.startGame, { code: CODE, playerToken: HOST.playerToken });
    } finally {
      random.mockRestore();
    }

    const raw = await t.run(async (ctx) => ctx.db.query("gameStates").first());
    const state = raw!.public as GameState;
    expect(state.players.map((player) => player.id)).toEqual([
      firstBot.botId,
      secondBot.botId,
      HOST.playerId,
    ]);

    const info = await rawRoom(t);
    const events = await t.query(api.rooms.listEvents, { roomId: info!.roomId });
    expect(events.some((event) => event.message.includes("Orden de turnos"))).toBe(true);
  });

  test("los bots completan la colocación inicial y juegan su turno tras unos segundos", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await startRoomWithBots(t, { bots: 2, limit: 60 });

    await placeHostSetup(t);
    await advanceBotActions(t, 4);

    let room = await snapshot(t);
    expect(room.game?.phase).toBe("setup-settlement");
    expect(room.game?.currentPlayerId).toBe(HOST.playerId);
    expect(room.game?.players.every((player) => player.settlementsBuilt >= 1)).toBe(true);
    expect(room.game?.players.every((player) => player.roadsBuilt >= 1)).toBe(true);

    await placeHostSetup(t);
    room = await snapshot(t);
    expect(room.game?.phase).toBe("awaiting-roll");
    expect(room.game?.turnNumber).toBe(1);

    await act(t, { type: "roll" });
    room = await snapshot(t);
    if (room.game?.phase === "robber") {
      const hexId = safeRobberHex(room);
      await act(t, { type: "move-robber", hexId, victimId: null });
    }
    await act(t, { type: "end-turn" });

    const bot = room.players.find((player) => player.isBot)!;
    await advanceBotActions(t, 1);

    room = await snapshot(t);
    const stat = room.turnStats[bot.id];
    expect(stat?.turns).toBe(1);
    expect(stat?.lastTurnMs).toBeGreaterThanOrEqual(4_000);
    expect(room.game?.currentPlayerId).not.toBe(bot.id);
  });

  test("la colocación inicial da 2 minutos por poblado y 20 segundos por camino", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await startRoomWithBots(t, { bots: 2, limit: 15 });

    let room = await snapshot(t);
    expect(room.turnTimeLimitSeconds).toBe(15);
    expect(room.game?.phase).toBe("setup-settlement");
    const settlementWindow = (room.turnDeadlineAt ?? 0) - Date.now();
    expect(settlementWindow).toBeGreaterThan(119_000);
    expect(settlementWindow).toBeLessThanOrEqual(120_000);

    const host = room.game?.players.find((player) => player.id === HOST.playerId);
    expect(host?.settlementsBuilt).toBe(0);

    vi.advanceTimersByTime(120_500);
    await t.finishInProgressScheduledFunctions();

    room = await snapshot(t);
    const afterSettlement = room.game?.players.find((player) => player.id === HOST.playerId);
    expect(afterSettlement?.settlementsBuilt).toBe(1);
    expect(room.game?.phase).toBe("setup-road");
    const roadWindow = (room.turnDeadlineAt ?? 0) - Date.now();
    expect(roadWindow).toBeGreaterThan(19_000);
    expect(roadWindow).toBeLessThanOrEqual(20_000);

    vi.advanceTimersByTime(20_500);
    await t.finishInProgressScheduledFunctions();

    room = await snapshot(t);
    const afterRoad = room.game?.players.find((player) => player.id === HOST.playerId);
    expect(afterRoad?.roadsBuilt).toBe(1);
    expect(room.game?.currentPlayerId).not.toBe(HOST.playerId);
    expect(room.turnDeadlineAt).not.toBeNull();
  });

  test("el dado se tira solo cuando se agota la ventana de cinco segundos", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await startRoomWithBots(t, { bots: 2, limit: 60 });

    await placeHostSetup(t);
    await advanceBotActions(t, 4);
    await placeHostSetup(t);

    let room = await snapshot(t);
    expect(room.game?.phase).toBe("awaiting-roll");
    const remaining = (room.turnDeadlineAt ?? 0) - Date.now();
    expect(remaining).toBeLessThanOrEqual(5_000);
    expect(remaining).toBeGreaterThan(4_000);

    vi.advanceTimersByTime(5_200);
    await t.finishInProgressScheduledFunctions();

    room = await snapshot(t);
    expect(room.game?.lastRoll).not.toBeNull();
    expect(room.game?.phase).not.toBe("awaiting-roll");
  });

  test("las respuestas del comercio se auto-rechazan a los cinco segundos", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await startRoomWithBots(t, { bots: 2, limit: 60 });

    await placeHostSetup(t);
    await advanceBotActions(t, 4);
    await placeHostSetup(t);

    await t.run(async (ctx) => {
      const game = await ctx.db.query("gameStates").first();
      const publicState = game!.public as GameState;
      publicState.phase = "main";
      await ctx.db.patch(game!._id, { public: publicState });
      const playerStates = await ctx.db.query("playerStates").collect();
      const bundles = [
        { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 },
        { wood: 0, brick: 1, sheep: 0, wheat: 0, ore: 0 },
        { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      ];
      for (const playerState of playerStates) {
        const index = publicState.players.findIndex(( player) => player.id === playerState.playerId);
        if (index >= 0) {
          await ctx.db.patch(playerState._id, { resources: bundles[index] });
        }
      }
    });

    await act(t, {
      type: "make-offer",
      give: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      want: { wood: 0, brick: 1, sheep: 0, wheat: 0, ore: 0 },
    });

    let room = await snapshot(t);
    expect(room.game?.phase).toBe("trade");
    expect(room.tradeRespondDeadlineAt).not.toBeNull();

    vi.advanceTimersByTime(4_000);
    await t.finishInProgressScheduledFunctions();
    room = await snapshot(t);
    expect(room.game?.activeTrade?.rejectedBy).toEqual([]);

    vi.advanceTimersByTime(1_500);
    await t.finishInProgressScheduledFunctions();
    room = await snapshot(t);
    expect(room.game?.activeTrade?.rejectedBy).toHaveLength(2);

    vi.advanceTimersByTime(11_000);
    await t.finishInProgressScheduledFunctions();
    room = await snapshot(t);
    expect(room.game?.activeTrade).toBeNull();
    expect(room.game?.phase).toBe("main");
  });

  test("solo el anfitrión configura los bots y el límite de tiempo", async () => {
    const t = convexTest(schema, modules);
    await createRoom(t);
    const outro = {
      playerId: "outro-player-00000000000000",
      playerToken: "outro-token-00000000000000000000000000000",
    };
    await t.mutation(api.rooms.joinRoom, { code: CODE, ...outro, name: "Outro" });

    await expect(
      t.mutation(api.rooms.addBot, { code: CODE, playerToken: outro.playerToken }),
    ).rejects.toThrow(/anfitrión|creó la sala/i);
    await expect(
      t.mutation(api.rooms.setTurnTimeLimit, {
        code: CODE,
        playerToken: outro.playerToken,
        seconds: 30,
      }),
    ).rejects.toThrow(/anfitrión|creó la sala/i);
    await expect(
      t.mutation(api.rooms.setTurnTimeLimit, {
        code: CODE,
        playerToken: HOST.playerToken,
        seconds: 5,
      }),
    ).rejects.toThrow(/límite/i);
  });

  test("la pausa con bots se aprueba al instante y congela el tiempo", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await startRoomWithBots(t, { bots: 2, limit: 60 });

    let room = await snapshot(t);
    expect(room.turnDeadlineAt).not.toBeNull();
    expect(room.pausedAt).toBeNull();

    await t.mutation(api.rooms.requestPause, {
      code: CODE,
      playerToken: HOST.playerToken,
      mode: "pause",
    });
    room = await snapshot(t);
    expect(room.pausedAt).not.toBeNull();
    expect(room.turnDeadlineAt).toBeNull();
    expect(room.pauseRequest).toBeNull();
    expect(room.pauseRemainingMs).toBeGreaterThan(0);

    await expect(
      act(t, {
        type: "place-setup-settlement",
        vertexId: room.legal.settlementVertexIds[0]!,
      }),
    ).rejects.toThrow(/pausa/i);

    vi.advanceTimersByTime(120_000);
    await t.finishInProgressScheduledFunctions();
    room = await snapshot(t);
    const host = room.game?.players.find((player) => player.id === HOST.playerId);
    expect(host?.settlementsBuilt).toBe(0);
    expect(room.pausedAt).not.toBeNull();

    await t.mutation(api.rooms.requestPause, {
      code: CODE,
      playerToken: HOST.playerToken,
      mode: "resume",
    });
    room = await snapshot(t);
    expect(room.pausedAt).toBeNull();
    expect(room.turnDeadlineAt).not.toBeNull();
    const restored = (room.turnDeadlineAt ?? 0) - Date.now();
    expect(restored).toBeGreaterThan(0);
    expect(restored).toBeLessThanOrEqual(120_000);
  });

  test("la pausa necesita el voto de todos y un rechazo la cancela", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await createRoom(t);
    await t.mutation(api.rooms.addBot, { code: CODE, playerToken: HOST.playerToken });
    const outro = {
      playerId: "outro-player-00000000000000",
      playerToken: "outro-token-00000000000000000000000000000",
    };
    await t.mutation(api.rooms.joinRoom, { code: CODE, ...outro, name: "Outro" });
    await t.mutation(api.rooms.setReady, {
      code: CODE,
      playerToken: HOST.playerToken,
      ready: true,
    });
    await t.mutation(api.rooms.setReady, {
      code: CODE,
      playerToken: outro.playerToken,
      ready: true,
    });
    await startGameWithoutShuffle(t);

    await t.mutation(api.rooms.requestPause, {
      code: CODE,
      playerToken: HOST.playerToken,
      mode: "pause",
    });
    let room = await snapshot(t);
    expect(room.pausedAt).toBeNull();
    expect(room.pauseRequest).not.toBeNull();
    expect(room.pauseRequest?.votes[outro.playerId]).toBeUndefined();

    await t.mutation(api.rooms.votePause, {
      code: CODE,
      playerToken: outro.playerToken,
      approve: false,
    });
    room = await snapshot(t);
    expect(room.pauseRequest).toBeNull();
    expect(room.pausedAt).toBeNull();

    await t.mutation(api.rooms.requestPause, {
      code: CODE,
      playerToken: HOST.playerToken,
      mode: "pause",
    });
    await t.mutation(api.rooms.votePause, {
      code: CODE,
      playerToken: outro.playerToken,
      approve: true,
    });
    room = await snapshot(t);
    expect(room.pausedAt).not.toBeNull();
    expect(room.pauseRequest).toBeNull();
  });
});

function safeRobberHex(room: Awaited<ReturnType<typeof snapshot>>): string {
  const game = room.game!;
  const robberHexIds = room.legal.robberHexIds;
  const vertexById = new Map(game.board.vertices.map((vertex) => [vertex.id, vertex]));
  for (const hexId of robberHexIds) {
    const adjacentOpponents = game.players.filter(
      (player) =>
        player.id !== HOST.playerId &&
        [...player.settlementVertexIds, ...player.cityVertexIds].some((vertexId) =>
          vertexById.get(vertexId)?.hexIds.includes(hexId),
        ),
    );
    const withCards = adjacentOpponents.filter((player) => player.resourceCardCount > 0);
    if (withCards.length === 0) return hexId;
  }
  return robberHexIds[0]!;
}

async function placeHostSetupWithShips(t: TestClient): Promise<void> {
  const room = await snapshot(t);
  const vertexId = room.legal.settlementVertexIds[0];
  if (!vertexId) throw new Error("No hay vértices legales para el poblado inicial.");
  await act(t, { type: "place-setup-settlement", vertexId });
  const afterSettlement = await snapshot(t);
  const roadId = afterSettlement.legal.roadIds[0];
  if (roadId) {
    await act(t, { type: "place-setup-road", edgeId: roadId, kind: "road" });
    return;
  }
  const shipId = afterSettlement.legal.shipIds[0];
  if (!shipId) throw new Error("No hay rutas iniciales legales.");
  await act(t, { type: "place-setup-road", edgeId: shipId, kind: "ship" });
}

describe("expansión Navegantes", () => {
  test("el anfitrión elige mapa y la partida arranca con el tablero del escenario", async () => {
    const t = convexTest(schema, modules);
    await createRoom(t);
    await t.mutation(api.rooms.addBot, { code: CODE, playerToken: HOST.playerToken });
    await t.mutation(api.rooms.addBot, { code: CODE, playerToken: HOST.playerToken });
    await t.mutation(api.rooms.setScenario, {
      code: CODE,
      playerToken: HOST.playerToken,
      scenario: "heading-for-new-shores",
    });
    await t.mutation(api.rooms.setSetupMode, {
      code: CODE,
      playerToken: HOST.playerToken,
      setupMode: "fixed",
    });
    await t.mutation(api.rooms.setReady, {
      code: CODE,
      playerToken: HOST.playerToken,
      ready: true,
    });
    await startGameWithoutShuffle(t);

    const room = await snapshot(t);
    expect(room.expansion).toBe("seafarers");
    expect(room.scenario).toBe("heading-for-new-shores");
    expect(
      room.game?.board.hexes.filter((hex) => hex.terrain !== "sea").length,
    ).toBe(22);
    expect(room.game?.board.hexes.some((hex) => hex.terrain === "sea")).toBe(true);
    expect(room.game?.board.regions?.filter((region) => region.kind === "small-island")).toHaveLength(4);
    expect(room.game?.winThreshold).toBe(14);
    expect(room.game?.piratePosition?.kind).toBe("hex");
  });

  test("los bots completan el setup con caminos o barcos sin trabarse", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await createRoom(t);
    await t.mutation(api.rooms.addBot, { code: CODE, playerToken: HOST.playerToken });
    await t.mutation(api.rooms.addBot, { code: CODE, playerToken: HOST.playerToken });
    await t.mutation(api.rooms.setScenario, {
      code: CODE,
      playerToken: HOST.playerToken,
      scenario: "heading-for-new-shores",
    });
    await t.mutation(api.rooms.setReady, {
      code: CODE,
      playerToken: HOST.playerToken,
      ready: true,
    });
    await startGameWithoutShuffle(t);

    await placeHostSetupWithShips(t);
    await advanceBotActions(t, 4);
    await placeHostSetupWithShips(t);

    const room = await snapshot(t);
    expect(room.game?.phase).toBe("awaiting-roll");
    expect(
      room.game?.board.hexes.filter((hex) => hex.terrain !== "sea").length,
    ).toBe(22);
    expect(room.game?.players.every((player) => player.settlementsBuilt >= 1)).toBe(true);
    const routeTotal = room.game!.players.reduce(
      (sum, player) => sum + player.roadsBuilt + player.shipsBuilt,
      0,
    );
    expect(routeTotal).toBeGreaterThanOrEqual(3);
  });
});
