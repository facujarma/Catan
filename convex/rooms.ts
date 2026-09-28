import {
  applyAction,
  createGame,
  EngineError,
  getLegalCityUpgrades,
  getLegalRoadPlacements,
  getLegalSettlementPlacements,
  getMaritimeTradeRatio,
  getPlayerView,
} from "@catan/engine";
import type { GameAction, GameState } from "@catan/engine";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx, type RoomDocument } from "./lib/server";
import { gameActionValidator } from "./validators";

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}$/;
const PRESENCE_TIMEOUT_MS = 45_000;
const MAX_ROOM_PLAYERS = 4;
const MAX_NAME_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 500;

type RoomMember = RoomDocument["players"][number];

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
      return `${playerName} tiró ${nextState.lastRoll?.dice.join(" + ") ?? "los dados"} (${nextState.lastRoll?.total ?? "?"}).`;
    case "discard":
      return `${playerName} descartó cartas tras un siete.`;
    case "move-robber":
      return `${playerName} movió al ladrón.`;
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
      players: room.players.map(({ id, name }) => ({ id, name })),
      seed: String(room._id),
    });
    await ctx.db.patch(room._id, {
      status: "playing",
      gameState,
      updatedAt: Date.now(),
    });
    await writeEvent(ctx, room, member.id, member.name, "system", "La partida comenzó.");
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
        isHost: player.id === room.hostPlayerId,
        isSelf: player.id === member.id,
        online: now - (lastSeenByPlayerId.get(player.id) ?? 0) < PRESENCE_TIMEOUT_MS,
      })),
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

    const action = { ...args.action, playerId: member.id } as GameAction;
    let nextState: GameState;
    try {
      nextState = applyAction(room.gameState as GameState, action);
    } catch (error) {
      if (error instanceof EngineError) {
        throw new ConvexError({ code: error.code, message: error.message });
      }
      throw error;
    }

    const status = nextState.phase === "finished" ? "finished" : "playing";
    await ctx.db.patch(room._id, { gameState: nextState, status, updatedAt: Date.now() });
    await writeEvent(ctx, room, member.id, member.name, "action", actionLogMessage(action, member.name, nextState));
    return { phase: nextState.phase, winnerId: nextState.winnerId };
  },
});
