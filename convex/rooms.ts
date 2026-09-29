import {
  applyAction,
  createGame,
  emptyResources,
  EngineError,
  getLegalCityUpgrades,
  getLegalRoadPlacements,
  getLegalSettlementPlacements,
  getMaritimeTradeRatio,
  getPlayerView,
  getRobberVictims,
  RESOURCES,
} from "@catan/engine";
import type { GameAction, GameState, Resource, ResourceBundle } from "@catan/engine";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { mutation, query, type MutationCtx, type QueryCtx, type RoomDocument } from "./lib/server";
import { gameActionValidator } from "./validators";

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}$/;
const PRESENCE_TIMEOUT_MS = 45_000;
const MAX_ROOM_PLAYERS = 4;
const MAX_NAME_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 500;
const DEFAULT_TURN_TIME_LIMIT_SECONDS = 60;
const MIN_TURN_TIME_LIMIT_SECONDS = 10;
const MAX_TURN_TIME_LIMIT_SECONDS = 600;
const BOT_ACTION_DELAY_MS = 4_500;
const MAX_BOT_ACTIONS_PER_RUN = 8;
const MAX_TIMEOUT_ACTIONS_PER_RUN = 16;
const ROLL_WINDOW_MS = 5_000;
const DISCARD_WINDOW_MS = 20_000;
const ROBBER_WINDOW_MS = 20_000;
const OFFER_WINDOW_MS = 15_000;
const TRADE_RESPONSE_WINDOW_MS = 5_000;

type RoomMember = RoomDocument["players"][number];

interface TurnStat {
  totalMs: number;
  turns: number;
  lastTurnMs: number;
}

interface GameFlow {
  state: GameState;
  turnStartedAt: number | null;
  turnDeadlineAt: number | null;
  turnResumeRemainingMs: number | null;
  tradeRespondDeadlineAt: number | null;
  turnStats: Record<string, TurnStat>;
}

type GameStep =
  | "setup"
  | "roll"
  | "discard"
  | "robber"
  | "robber-victim"
  | "main"
  | "trade"
  | "finished";

interface FlowEvent {
  actorId: string | null;
  actorName: string;
  kind: "system" | "action";
  message: string;
}

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function normalizeCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(normalized)) {
    fail("INVALID_ROOM_CODE", "El código debe tener cuatro caracteres válidos.");
  }
  return normalized;
}

function normalizeName(name: string): string {
  const normalized = name.trim().slice(0, MAX_NAME_LENGTH);
  if (normalized.length < 2) fail("INVALID_NAME", "El nombre debe tener al menos 2 caracteres.");
  return normalized;
}

function validateIdentity(playerId: string, playerToken: string): void {
  if (playerId.trim().length < 16 || playerToken.trim().length < 32) {
    fail("INVALID_IDENTITY", "La identidad anónima no es válida.");
  }
}

async function findRoom(ctx: QueryCtx | MutationCtx, code: string): Promise<RoomDocument | null> {
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (index) => index.eq("code", code))
    .unique();
}

async function requireRoom(
  ctx: QueryCtx | MutationCtx,
  code: string,
): Promise<RoomDocument> {
  const room = await findRoom(ctx, normalizeCode(code));
  if (!room) fail("ROOM_NOT_FOUND", "No encontramos una sala con ese código.");
  return room;
}

function requireMember(room: RoomDocument, playerToken: string): RoomMember {
  if (playerToken.length < 32) fail("UNAUTHORIZED", "La identidad no pertenece a esta sala.");
  const member = room.players.find((player) => player.token === playerToken);
  if (!member) fail("UNAUTHORIZED", "La identidad no pertenece a esta sala.");
  return member;
}

async function upsertPresence(
  ctx: MutationCtx,
  roomId: RoomDocument["_id"],
  playerId: string,
  lastSeenAt: number,
): Promise<void> {
  const previous = await ctx.db
    .query("presence")
    .withIndex("by_room_player", (index) =>
      index.eq("roomId", roomId).eq("playerId", playerId),
    )
    .unique();
  if (previous) {
    await ctx.db.patch(previous._id, { lastSeenAt });
  } else {
    await ctx.db.insert("presence", { roomId, playerId, lastSeenAt });
  }
}

async function requireRoomMember(
  ctx: MutationCtx,
  code: string,
  playerToken: string,
): Promise<{ room: RoomDocument; member: RoomMember }> {
  const room = await requireRoom(ctx, code);
  const member = requireMember(room, playerToken);
  return { room, member };
}

function actionLogMessage(action: GameAction, playerName: string, nextState: GameState): string {
  switch (action.type) {
    case "place-setup-settlement":
    case "build-settlement":
      return `${playerName} construyó un poblado.`;
    case "place-setup-road":
    case "build-road":
      return `${playerName} construyó un camino.`;
    case "build-city":
      return `${playerName} mejoró un poblado a ciudad.`;
    case "roll":
      return `${playerName} tiró ${nextState.lastRoll?.dice.join(" y ") ?? "los dados"}.`;
    case "discard":
      return `${playerName} descartó cartas tras un siete.`;
    case "move-robber":
      return `${playerName} movió al ladrón.`;
    case "choose-robber-victim": {
      const victimName =
        nextState.players.find((player) => player.id === action.victimId)?.name ?? "un rival";
      return `${playerName} le robó una carta a ${victimName}.`;
    }
    case "buy-development-card":
      return `${playerName} compró una carta de desarrollo.`;
    case "play-knight":
      return `${playerName} jugó un caballero.`;
    case "play-monopoly":
      return `${playerName} jugó monopolio.`;
    case "play-year-of-plenty":
      return `${playerName} jugó año de la abundancia.`;
    case "play-road-building":
      return `${playerName} jugó construcción de caminos.`;
    case "make-offer":
      return `${playerName} ofreció un intercambio a la mesa.`;
    case "counter-offer":
      return `${playerName} hizo una contraoferta a la mesa.`;
    case "accept-offer":
      return `${playerName} aceptó el intercambio.`;
    case "reject-offer":
      return `${playerName} rechazó el intercambio.`;
    case "confirm-offer":
      return `${playerName} cerró el intercambio.`;
    case "cancel-offer":
      return `${playerName} canceló su oferta de intercambio.`;
    case "maritime-trade":
      return `${playerName} comerció con el banco.`;
    case "end-turn":
      return `${playerName} terminó su turno.`;
    default:
      return `${playerName} realizó una acción.`;
  }
}

async function writeEvent(
  ctx: MutationCtx,
  room: RoomDocument,
  actorId: string | null,
  actorName: string,
  kind: "system" | "action",
  message: string,
): Promise<void> {
  await ctx.db.insert("gameEvents", {
    roomId: room._id,
    actorId,
    actorName,
    kind,
    message,
    createdAt: Date.now(),
  });
}

function playerIdAt(state: GameState): string {
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error("El estado no tiene un jugador activo.");
  return player.id;
}

function playerName(room: RoomDocument, playerId: string): string {
  return room.players.find((player) => player.id === playerId)?.name ?? "Jugador";
}

function isBotPlayer(room: RoomDocument, playerId: string): boolean {
  return room.players.some((player) => player.id === playerId && player.isBot === true);
}

function botsNeedingDiscard(room: RoomDocument, state: GameState): string[] {
  return Object.keys(state.pendingDiscards)
    .filter((playerId) => isBotPlayer(room, playerId))
    .sort();
}

function botActionKey(room: RoomDocument, state: GameState): string | null {
  const discards = botsNeedingDiscard(room, state);
  const actingPlayerId = playerIdAt(state);
  if (discards.length === 0 && !isBotPlayer(room, actingPlayerId)) return null;
  return [state.turnNumber, state.phase, actingPlayerId, discards.join("+")].join(":");
}

function randomItem<T>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function randomDiscardBundle(state: GameState, playerId: string, count: number): ResourceBundle {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const pool: Resource[] = [];
  if (player) {
    for (const resource of RESOURCES) {
      for (let amount = 0; amount < player.resources[resource]; amount += 1) pool.push(resource);
    }
  }
  const bundle = emptyResources();
  for (let taken = 0; taken < count && pool.length > 0; taken += 1) {
    const [resource] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    if (resource) bundle[resource] += 1;
  }
  return bundle;
}

function randomRobberHexAction(state: GameState, playerId: string): GameAction | null {
  const hexId = randomItem(
    state.board.hexes.filter((hex) => hex.id !== state.robberHexId).map((hex) => hex.id),
  );
  return hexId ? { type: "move-robber", playerId, hexId, victimId: null } : null;
}

function randomVictimAction(state: GameState, playerId: string): GameAction | null {
  const pending = state.pendingRobberVictim;
  const victimId = pending ? randomItem(pending.victimIds) : null;
  return victimId ? { type: "choose-robber-victim", playerId, victimId } : null;
}

function botTurnAction(state: GameState, playerId: string): GameAction | null {
  switch (state.phase) {
    case "setup-settlement": {
      const vertexId = randomItem(getLegalSettlementPlacements(state, playerId));
      return vertexId ? { type: "place-setup-settlement", playerId, vertexId } : null;
    }
    case "setup-road": {
      const edgeId = randomItem(getLegalRoadPlacements(state, playerId));
      return edgeId ? { type: "place-setup-road", playerId, edgeId } : null;
    }
    case "awaiting-roll":
      return { type: "roll", playerId };
    case "robber":
      return randomRobberHexAction(state, playerId);
    case "robber-victim":
      return randomVictimAction(state, playerId);
    case "main":
    case "trade":
      return { type: "end-turn", playerId };
    default:
      return null;
  }
}

function deadlineAction(state: GameState): GameAction | null {
  const playerId = playerIdAt(state);
  switch (state.phase) {
    case "setup-settlement":
    case "setup-road":
    case "awaiting-roll":
    case "robber":
    case "robber-victim":
      return botTurnAction(state, playerId);
    case "discard": {
      const discardPlayerId = Object.keys(state.pendingDiscards)[0];
      if (!discardPlayerId) return null;
      return {
        type: "discard",
        playerId: discardPlayerId,
        resources: randomDiscardBundle(
          state,
          discardPlayerId,
          state.pendingDiscards[discardPlayerId]!,
        ),
      };
    }
    case "main":
      return { type: "end-turn", playerId };
    case "trade": {
      const offer = state.activeTrade;
      if (!offer) return null;
      const partnerId = randomItem(offer.acceptedBy);
      return partnerId
        ? { type: "confirm-offer", playerId: offer.fromPlayerId, partnerId }
        : { type: "cancel-offer", playerId: offer.fromPlayerId };
    }
    case "finished":
      return null;
  }
}

function stepOf(state: GameState): GameStep {
  switch (state.phase) {
    case "setup-settlement":
    case "setup-road":
      return "setup";
    case "awaiting-roll":
      return "roll";
    case "discard":
      return "discard";
    case "robber":
      return "robber";
    case "robber-victim":
      return "robber-victim";
    case "main":
      return "main";
    case "trade":
      return "trade";
    case "finished":
      return "finished";
  }
}

function stepDurationMs(step: GameStep, limitSeconds: number): number | null {
  switch (step) {
    case "roll":
      return ROLL_WINDOW_MS;
    case "discard":
      return DISCARD_WINDOW_MS;
    case "robber":
    case "robber-victim":
      return ROBBER_WINDOW_MS;
    case "trade":
      return OFFER_WINDOW_MS;
    case "setup":
    case "main":
      return limitSeconds > 0 ? limitSeconds * 1000 : null;
    case "finished":
      return null;
  }
}

function deadlineFor(step: GameStep, now: number, limitSeconds: number): number | null {
  const duration = stepDurationMs(step, limitSeconds);
  return duration === null ? null : now + duration;
}

function gameFlowFromRoom(room: RoomDocument): GameFlow | null {
  const state = room.gameState as GameState | undefined;
  if (!state) return null;
  return {
    state,
    turnStartedAt: room.turnStartedAt ?? null,
    turnDeadlineAt: room.turnDeadlineAt ?? null,
    turnResumeRemainingMs: room.turnResumeRemainingMs ?? null,
    tradeRespondDeadlineAt: room.tradeRespondDeadlineAt ?? null,
    turnStats: { ...(room.turnStats ?? {}) },
  };
}

function advanceGameFlow(room: RoomDocument, flow: GameFlow, action: GameAction): GameFlow {
  const previous = flow.state;
  const next = applyAction(previous, action);
  const now = Date.now();
  const limitSeconds = room.turnTimeLimitSeconds ?? DEFAULT_TURN_TIME_LIMIT_SECONDS;
  const previousPlayerId = playerIdAt(previous);
  const nextPlayerId = playerIdAt(next);
  const playerChanged = previousPlayerId !== nextPlayerId;
  const turnAdvanced = next.turnNumber !== previous.turnNumber;
  const finished = next.phase === "finished";
  const turnEnded = previous.turnNumber >= 1 && (playerChanged || turnAdvanced || finished);

  const turnStats = { ...flow.turnStats };
  let turnStartedAt = flow.turnStartedAt;

  if (turnEnded) {
    const duration = Math.max(0, now - (turnStartedAt ?? now));
    const previousStats = turnStats[previousPlayerId] ?? { totalMs: 0, turns: 0, lastTurnMs: 0 };
    turnStats[previousPlayerId] = {
      totalMs: previousStats.totalMs + duration,
      turns: previousStats.turns + 1,
      lastTurnMs: duration,
    };
    turnStartedAt = null;
  }

  if (!finished && (playerChanged || turnAdvanced || turnStartedAt === null)) {
    turnStartedAt = now;
  }

  let turnDeadlineAt = flow.turnDeadlineAt;
  let turnResumeRemainingMs = flow.turnResumeRemainingMs;
  let tradeRespondDeadlineAt = flow.tradeRespondDeadlineAt;

  if (finished) {
    turnDeadlineAt = null;
    turnResumeRemainingMs = null;
    tradeRespondDeadlineAt = null;
  } else {
    const previousStep = stepOf(previous);
    const nextStep = stepOf(next);

    if (playerChanged || turnAdvanced) {
      turnResumeRemainingMs = null;
      tradeRespondDeadlineAt = null;
      turnDeadlineAt = deadlineFor(nextStep, now, limitSeconds);
    } else if (nextStep !== previousStep) {
      if (nextStep === "main") {
        turnDeadlineAt =
          turnResumeRemainingMs !== null
            ? now + turnResumeRemainingMs
            : deadlineFor("main", now, limitSeconds);
        turnResumeRemainingMs = null;
        tradeRespondDeadlineAt = null;
      } else if (previousStep === "main" && (nextStep === "robber" || nextStep === "trade")) {
        turnResumeRemainingMs =
          turnDeadlineAt !== null ? Math.max(0, turnDeadlineAt - now) : null;
        turnDeadlineAt = deadlineFor(nextStep, now, limitSeconds);
        tradeRespondDeadlineAt = nextStep === "trade" ? now + TRADE_RESPONSE_WINDOW_MS : null;
      } else {
        turnDeadlineAt = deadlineFor(nextStep, now, limitSeconds);
        tradeRespondDeadlineAt = nextStep === "trade" ? now + TRADE_RESPONSE_WINDOW_MS : null;
      }
    } else if (previousStep === "trade" && previous.activeTrade?.id !== next.activeTrade?.id) {
      turnDeadlineAt = now + OFFER_WINDOW_MS;
      tradeRespondDeadlineAt = now + TRADE_RESPONSE_WINDOW_MS;
    }
  }

  return {
    state: next,
    turnStartedAt,
    turnDeadlineAt,
    turnResumeRemainingMs,
    tradeRespondDeadlineAt,
    turnStats,
  };
}

function actionEvent(action: GameAction, actorName: string, nextState: GameState): FlowEvent {
  return {
    actorId: action.playerId,
    actorName,
    kind: "action",
    message: actionLogMessage(action, actorName, nextState),
  };
}

function deadlineMessage(step: GameStep, playerName: string): string {
  switch (step) {
    case "roll":
      return `Se agotó el tiempo de ${playerName} para tirar; los dados se tiraron solos.`;
    case "discard":
      return "Se agotó el tiempo de descarte; se descartaron cartas al azar.";
    case "robber":
      return `Se agotó el tiempo de ${playerName} para mover al ladrón; se movió al azar.`;
    case "robber-victim":
      return `Se agotó el tiempo de ${playerName} para elegir a quién robar; se eligió al azar.`;
    case "trade":
      return "Se agotó el tiempo del comercio; se resolvió automáticamente.";
    case "setup":
      return "Se agotó el tiempo de colocación inicial; se colocó al azar.";
    case "main":
      return `Se agotó el tiempo de ${playerName}; se pasó el turno.`;
    case "finished":
      return "";
  }
}

async function commitGameFlow(
  ctx: MutationCtx,
  room: RoomDocument,
  flow: GameFlow,
  events: FlowEvent[] = [],
): Promise<void> {
  const now = Date.now();
  const finished = flow.state.phase === "finished";
  const botKey = finished ? null : botActionKey(room, flow.state);

  await ctx.db.patch(room._id, {
    gameState: flow.state,
    status: finished ? "finished" : "playing",
    updatedAt: now,
    turnStartedAt: flow.turnStartedAt ?? undefined,
    turnDeadlineAt: flow.turnDeadlineAt ?? undefined,
    turnResumeRemainingMs: flow.turnResumeRemainingMs ?? undefined,
    tradeRespondDeadlineAt: flow.tradeRespondDeadlineAt ?? undefined,
    turnStats: flow.turnStats,
    botTurnKey: botKey ?? undefined,
  });

  for (const event of events) {
    await writeEvent(ctx, room, event.actorId, event.actorName, event.kind, event.message);
  }

  if (flow.turnDeadlineAt !== null) {
    await ctx.scheduler.runAfter(
      Math.max(0, flow.turnDeadlineAt - now),
      internal.rooms.enforceTurnTimeout,
      {
        roomId: room._id,
        expectedDeadline: flow.turnDeadlineAt,
      },
    );
  }

  if (flow.tradeRespondDeadlineAt !== null) {
    await ctx.scheduler.runAfter(
      Math.max(0, flow.tradeRespondDeadlineAt - now),
      internal.rooms.expireTradeResponses,
      {
        roomId: room._id,
        expectedDeadline: flow.tradeRespondDeadlineAt,
      },
    );
  }

  if (botKey !== null && room.botTurnKey !== botKey) {
    await ctx.scheduler.runAfter(BOT_ACTION_DELAY_MS, internal.rooms.playBotTurn, {
      roomId: room._id,
      expectedKey: botKey,
    });
  }
}

function isValidTurnTimeLimit(seconds: number): boolean {
  if (!Number.isInteger(seconds)) return false;
  if (seconds === 0) return true;
  return seconds >= MIN_TURN_TIME_LIMIT_SECONDS && seconds <= MAX_TURN_TIME_LIMIT_SECONDS;
}

function createBotIdentity(prefix: string): string {
  const random = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random.padEnd(32, "0")}`;
}

function shufflePlayers<T>(players: T[]): T[] {
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex]!, shuffled[index]!];
  }
  return shuffled;
}

export const createRoom = mutation({
  args: {
    code: v.string(),
    playerId: v.string(),
    playerToken: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const code = normalizeCode(args.code);
    const playerId = args.playerId.trim();
    validateIdentity(playerId, args.playerToken);
    const name = normalizeName(args.name);
    if (await findRoom(ctx, code)) fail("ROOM_CODE_TAKEN", "Ese código ya está en uso; probá crear otra sala.");

    const now = Date.now();
    const roomId = await ctx.db.insert("rooms", {
      code,
      status: "lobby",
      hostPlayerId: playerId,
      players: [{ id: playerId, token: args.playerToken, name, ready: false, joinedAt: now }],
      turnTimeLimitSeconds: DEFAULT_TURN_TIME_LIMIT_SECONDS,
      createdAt: now,
      updatedAt: now,
    });
    await upsertPresence(ctx, roomId, playerId, now);
    await ctx.db.insert("gameEvents", {
      roomId,
      actorId: playerId,
      actorName: name,
      kind: "system",
      message: `${name} creó la sala ${code}.`,
      createdAt: now,
    });
    return { code };
  },
});

export const joinRoom = mutation({
  args: {
    code: v.string(),
    playerId: v.string(),
    playerToken: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const code = normalizeCode(args.code);
    const playerId = args.playerId.trim();
    validateIdentity(playerId, args.playerToken);
    const name = normalizeName(args.name);
    const room = await requireRoom(ctx, code);
    const returningMember = room.players.find((player) => player.token === args.playerToken);
    const now = Date.now();

    if (returningMember) {
      if (returningMember.id !== playerId) {
        fail("IDENTITY_MISMATCH", "Esta identidad ya está vinculada a otro jugador.");
      }
      if (room.status === "lobby" && returningMember.name !== name) {
        await ctx.db.patch(room._id, {
          players: room.players.map((player) =>
            player.id === playerId ? { ...player, name } : player,
          ),
          updatedAt: now,
        });
      }
      await upsertPresence(ctx, room._id, playerId, now);
      return { code, playerId };
    }

    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La partida ya comenzó.");
    if (room.players.length >= MAX_ROOM_PLAYERS) fail("ROOM_FULL", "La sala ya tiene cuatro jugadores.");
    if (room.players.some((player) => player.id === playerId)) {
      fail("IDENTITY_MISMATCH", "Ese id de jugador ya está ocupado en esta sala.");
    }

    await ctx.db.patch(room._id, {
      players: [
        ...room.players,
        { id: playerId, token: args.playerToken, name, ready: false, joinedAt: now },
      ],
      updatedAt: now,
    });
    await upsertPresence(ctx, room._id, playerId, now);
    await writeEvent(ctx, room, playerId, name, "system", `${name} se unió a la sala.`);
    return { code, playerId };
  },
});

export const setReady = mutation({
  args: { code: v.string(), playerToken: v.string(), ready: v.boolean() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La sala ya no está en el lobby.");
    const now = Date.now();
    await ctx.db.patch(room._id, {
      players: room.players.map((player) =>
        player.id === member.id ? { ...player, ready: args.ready } : player,
      ),
      updatedAt: now,
    });
    await upsertPresence(ctx, room._id, member.id, now);
    return { ready: args.ready };
  },
});

export const addBot = mutation({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La sala ya no está en el lobby.");
    if (member.id !== room.hostPlayerId) fail("HOST_ONLY", "Solo quien creó la sala puede agregar bots.");
    if (room.players.length >= MAX_ROOM_PLAYERS) fail("ROOM_FULL", "La sala ya tiene cuatro jugadores.");

    let number = 1;
    while (room.players.some((player) => player.name === `Bot ${number}`)) number += 1;
    const bot: RoomMember = {
      id: createBotIdentity("bot"),
      token: createBotIdentity("token"),
      name: `Bot ${number}`,
      ready: true,
      joinedAt: Date.now(),
      isBot: true,
    };
    await ctx.db.patch(room._id, {
      players: [...room.players, bot],
      updatedAt: Date.now(),
    });
    await writeEvent(ctx, room, bot.id, bot.name, "system", `${bot.name} se unió a la sala.`);
    return { botId: bot.id };
  },
});

export const removeBot = mutation({
  args: { code: v.string(), playerToken: v.string(), botId: v.string() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La sala ya no está en el lobby.");
    if (member.id !== room.hostPlayerId) fail("HOST_ONLY", "Solo quien creó la sala puede quitar bots.");
    const bot = room.players.find((player) => player.id === args.botId && player.isBot === true);
    if (!bot) fail("BOT_NOT_FOUND", "Ese bot ya no está en la sala.");

    await ctx.db.patch(room._id, {
      players: room.players.filter((player) => player.id !== bot.id),
      updatedAt: Date.now(),
    });
    await writeEvent(ctx, room, bot.id, bot.name, "system", `${bot.name} salió de la sala.`);
    return { removed: true };
  },
});

export const setTurnTimeLimit = mutation({
  args: { code: v.string(), playerToken: v.string(), seconds: v.number() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La sala ya no está en el lobby.");
    if (member.id !== room.hostPlayerId) {
      fail("HOST_ONLY", "Solo quien creó la sala puede cambiar el tiempo por turno.");
    }
    if (!isValidTurnTimeLimit(args.seconds)) {
      fail(
        "INVALID_TIME_LIMIT",
        `El límite debe ser 0 (sin límite) o estar entre ${MIN_TURN_TIME_LIMIT_SECONDS} y ${MAX_TURN_TIME_LIMIT_SECONDS} segundos.`,
      );
    }
    await ctx.db.patch(room._id, { turnTimeLimitSeconds: args.seconds, updatedAt: Date.now() });
    return { seconds: args.seconds };
  },
});

export const startGame = mutation({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La partida ya comenzó.");
    if (member.id !== room.hostPlayerId) fail("HOST_ONLY", "Solo quien creó la sala puede iniciar.");
    if (room.players.length < 3) fail("NOT_ENOUGH_PLAYERS", "Se necesitan al menos tres jugadores.");
    if (room.players.some((player) => !player.ready)) {
      fail("PLAYERS_NOT_READY", "Todos los jugadores deben marcarse listos.");
    }

    const gameState = createGame({
      players: shufflePlayers(room.players.map(({ id, name }) => ({ id, name }))),
      seed: String(room._id),
    });
    await writeEvent(ctx, room, member.id, member.name, "system", "La partida comenzó.");
    await writeEvent(
      ctx,
      room,
      member.id,
      member.name,
      "system",
      `Orden de turnos: ${gameState.players.map((player) => player.name).join(" → ")}.`,
    );
    const now = Date.now();
    await commitGameFlow(ctx, room, {
      state: gameState,
      turnStartedAt: now,
      turnDeadlineAt: deadlineFor(
        "setup",
        now,
        room.turnTimeLimitSeconds ?? DEFAULT_TURN_TIME_LIMIT_SECONDS,
      ),
      turnResumeRemainingMs: null,
      tradeRespondDeadlineAt: null,
      turnStats: {},
    });
    return { started: true };
  },
});

export const getRoom = query({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    let code: string;
    try {
      code = normalizeCode(args.code);
    } catch {
      return null;
    }
    const room = await findRoom(ctx, code);
    if (!room) return null;
    const member = room.players.find((player) => player.token === args.playerToken);
    if (!member) return null;

    const presence = await ctx.db
      .query("presence")
      .withIndex("by_room", (index) => index.eq("roomId", room._id))
      .collect();
    const now = Date.now();
    const lastSeenByPlayerId = new Map(presence.map((entry) => [entry.playerId, entry.lastSeenAt]));
    const gameState = room.gameState as GameState | undefined;

    return {
      code: room.code,
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      selfPlayerId: member.id,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        ready: player.ready,
        isBot: player.isBot === true,
        isHost: player.id === room.hostPlayerId,
        isSelf: player.id === member.id,
        online:
          player.isBot === true ||
          now - (lastSeenByPlayerId.get(player.id) ?? 0) < PRESENCE_TIMEOUT_MS,
      })),
      turnTimeLimitSeconds: room.turnTimeLimitSeconds ?? DEFAULT_TURN_TIME_LIMIT_SECONDS,
      turnDeadlineAt: room.turnDeadlineAt ?? null,
      tradeRespondDeadlineAt: room.tradeRespondDeadlineAt ?? null,
      turnStats: room.turnStats ?? {},
      game: gameState ? getPlayerView(gameState, member.id) : null,
      legal: gameState
        ? {
            settlementVertexIds: getLegalSettlementPlacements(gameState, member.id),
            roadIds: getLegalRoadPlacements(gameState, member.id),
            freeRoadIds: getLegalRoadPlacements(gameState, member.id, { free: true }),
            cityVertexIds: getLegalCityUpgrades(gameState, member.id),
            tradeRatios: {
              wood: getMaritimeTradeRatio(gameState, member.id, "wood"),
              brick: getMaritimeTradeRatio(gameState, member.id, "brick"),
              sheep: getMaritimeTradeRatio(gameState, member.id, "sheep"),
              wheat: getMaritimeTradeRatio(gameState, member.id, "wheat"),
              ore: getMaritimeTradeRatio(gameState, member.id, "ore"),
            },
            robberHexIds: gameState.board.hexes
              .filter((hex) => hex.id !== gameState.robberHexId)
              .map((hex) => hex.id),
          }
        : {
            settlementVertexIds: [],
            roadIds: [],
            freeRoadIds: [],
            cityVertexIds: [],
            tradeRatios: { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 },
            robberHexIds: [],
          },
    };
  },
});

export const heartbeat = mutation({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    await upsertPresence(ctx, room._id, member.id, Date.now());
    return { ok: true };
  },
});

export const leaveRoom = mutation({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_room_player", (index) =>
        index.eq("roomId", room._id).eq("playerId", member.id),
      )
      .unique();
    if (presence) await ctx.db.delete(presence._id);

    if (room.status !== "lobby") return { left: true, removedFromRoom: false };

    const players = room.players.filter((player) => player.id !== member.id);
    if (players.length === 0) {
      await ctx.db.delete(room._id);
      return { left: true, removedFromRoom: true };
    }

    const hostPlayerId = room.hostPlayerId === member.id ? players[0]!.id : room.hostPlayerId;
    await ctx.db.patch(room._id, { players, hostPlayerId, updatedAt: Date.now() });
    await writeEvent(ctx, room, member.id, member.name, "system", `${member.name} salió de la sala.`);
    return { left: true, removedFromRoom: true };
  },
});

export const sendMessage = mutation({
  args: { code: v.string(), playerToken: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    const body = args.body.trim();
    if (body.length === 0 || body.length > MAX_MESSAGE_LENGTH) {
      fail("INVALID_MESSAGE", `El mensaje debe tener entre 1 y ${MAX_MESSAGE_LENGTH} caracteres.`);
    }
    await ctx.db.insert("messages", {
      roomId: room._id,
      playerId: member.id,
      playerName: member.name,
      body,
      createdAt: Date.now(),
    });
    return { sent: true };
  },
});

export const listMessages = query({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.code);
    requireMember(room, args.playerToken);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_room_created_at", (index) => index.eq("roomId", room._id))
      .order("desc")
      .take(50);
    return messages.reverse().map(({ _id, playerId, playerName, body, createdAt }) => ({
      id: _id,
      playerId,
      playerName,
      body,
      createdAt,
    }));
  },
});

export const listEvents = query({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.code);
    requireMember(room, args.playerToken);
    const events = await ctx.db
      .query("gameEvents")
      .withIndex("by_room_created_at", (index) => index.eq("roomId", room._id))
      .order("desc")
      .take(50);
    return events.reverse().map(({ _id, actorId, actorName, kind, message, createdAt }) => ({
      id: _id,
      actorId,
      actorName,
      kind,
      message,
      createdAt,
    }));
  },
});

export const applyGameAction = mutation({
  args: {
    code: v.string(),
    playerToken: v.string(),
    action: gameActionValidator,
  },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "playing" || !room.gameState) {
      fail("GAME_NOT_RUNNING", "La sala todavía no tiene una partida en curso.");
    }
    const flow = gameFlowFromRoom(room);
    if (!flow) fail("GAME_NOT_RUNNING", "La sala todavía no tiene una partida en curso.");

    const action = { ...args.action, playerId: member.id } as GameAction;
    let next: GameFlow;
    try {
      next = advanceGameFlow(room, flow, action);
    } catch (error) {
      if (error instanceof EngineError) {
        throw new ConvexError({ code: error.code, message: error.message });
      }
      throw error;
    }

    await commitGameFlow(ctx, room, next, [actionEvent(action, member.name, next.state)]);
    return { phase: next.state.phase, winnerId: next.state.winnerId };
  },
});

export const playBotTurn = internalMutation({
  args: { roomId: v.id("rooms"), expectedKey: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get("rooms", args.roomId);
    if (!room || room.status !== "playing") return null;
    let flow = gameFlowFromRoom(room);
    if (!flow) return null;
    if (botActionKey(room, flow.state) !== args.expectedKey) return null;

    const actingPlayerId = playerIdAt(flow.state);
    const events: FlowEvent[] = [];
    for (let step = 0; step < MAX_BOT_ACTIONS_PER_RUN; step += 1) {
      const discardPlayerId = botsNeedingDiscard(room, flow.state)[0];
      const action =
        discardPlayerId !== undefined
          ? {
              type: "discard" as const,
              playerId: discardPlayerId,
              resources: randomDiscardBundle(
                flow.state,
                discardPlayerId,
                flow.state.pendingDiscards[discardPlayerId]!,
              ),
            }
          : playerIdAt(flow.state) === actingPlayerId && isBotPlayer(room, actingPlayerId)
            ? botTurnAction(flow.state, actingPlayerId)
            : null;
      if (!action) break;

      flow = advanceGameFlow(room, flow, action);
      events.push(actionEvent(action, playerName(room, action.playerId), flow.state));
      if (flow.state.phase === "finished") break;
      if (playerIdAt(flow.state) !== actingPlayerId && flow.state.phase !== "discard") break;
    }

    if (events.length === 0) return null;
    await commitGameFlow(ctx, room, flow, events);
    return null;
  },
});

export const enforceTurnTimeout = internalMutation({
  args: { roomId: v.id("rooms"), expectedDeadline: v.number() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get("rooms", args.roomId);
    if (!room || room.status !== "playing") return null;
    if (room.turnDeadlineAt !== args.expectedDeadline) return null;
    if (Date.now() < args.expectedDeadline) return null;
    let flow = gameFlowFromRoom(room);
    if (!flow) return null;

    const expiredPlayerId = playerIdAt(flow.state);
    const expiredPlayerName = playerName(room, expiredPlayerId);
    const expiredStep = stepOf(flow.state);
    const events: FlowEvent[] = [];

    for (let step = 0; step < MAX_TIMEOUT_ACTIONS_PER_RUN; step += 1) {
      const action = deadlineAction(flow.state);
      if (!action) break;
      const playerBefore = playerIdAt(flow.state);
      const stepBefore = stepOf(flow.state);
      flow = advanceGameFlow(room, flow, action);
      events.push(actionEvent(action, playerName(room, action.playerId), flow.state));
      if (flow.state.phase === "finished") break;
      if (stepOf(flow.state) !== stepBefore || playerIdAt(flow.state) !== playerBefore) break;
    }

    if (events.length === 0) return null;
    events.unshift({
      actorId: expiredPlayerId,
      actorName: expiredPlayerName,
      kind: "system",
      message: deadlineMessage(expiredStep, expiredPlayerName),
    });

    await commitGameFlow(ctx, room, flow, events);
    return null;
  },
});

export const expireTradeResponses = internalMutation({
  args: { roomId: v.id("rooms"), expectedDeadline: v.number() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get("rooms", args.roomId);
    if (!room || room.status !== "playing") return null;
    if (room.tradeRespondDeadlineAt !== args.expectedDeadline) return null;
    if (Date.now() < args.expectedDeadline) return null;
    let flow = gameFlowFromRoom(room);
    if (!flow) return null;
    const offer = flow.state.activeTrade;
    if (flow.state.phase !== "trade" || !offer) return null;

    const pendingResponders = flow.state.players.filter(
      (player) => player.id !== offer.fromPlayerId && !offer.acceptedBy.includes(player.id),
    );
    for (const responder of pendingResponders) {
      flow = advanceGameFlow(room, flow, { type: "reject-offer", playerId: responder.id });
    }
    flow = { ...flow, tradeRespondDeadlineAt: null };

    const events: FlowEvent[] =
      pendingResponders.length > 0
        ? [
            {
              actorId: null,
              actorName: "Mesa",
              kind: "system",
              message: "Los jugadores que no respondieron a tiempo rechazaron la oferta.",
            },
          ]
        : [];

    await commitGameFlow(ctx, room, flow, events);
    return null;
  },
});
