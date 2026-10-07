import {
  applyAction,
  buildPublicGameView,
  calculateLongestRoad,
  createGame,
  emptyResources,
  EngineError,
  getLegalCityUpgrades,
  getLegalRoadPlacements,
  getLegalShipMoveTargets,
  getLegalShipPlacements,
  getLegalSettlementPlacements,
  getMaritimeTradeRatio,
  getMovableShipIds,
  getPublicVictoryPoints,
  joinGameState,
  getRobberVictims,
  RESOURCES,
  SCENARIOS,
  splitGameState,
} from "@catan/engine";
import type {
  Board,
  GameAction,
  GameState,
  HeldDevelopmentCard,
  Resource,
  ResourceBundle,
  StoredPrivatePlayerState,
  StoredPublicState,
} from "@catan/engine";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  mutation,
  query,
  type GameStateDocument,
  type MutationCtx,
  type QueryCtx,
  type RoomDocument,
} from "./lib/server";
import { gameActionValidator } from "./validators";

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}$/;
const PRESENCE_STALE_MS = 50_000;
const PRESENCE_WRITE_THROTTLE_MS = 10_000;
const MAX_ROOM_PLAYERS = 4;
const MAX_NAME_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 500;
const FEED_LIMIT = 30;
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
const SETUP_SETTLEMENT_WINDOW_MS = 120_000;
const SETUP_ROAD_WINDOW_MS = 20_000;

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
  | "setup-settlement"
  | "setup-road"
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

interface LegalPlacements {
  settlementVertexIds: string[];
  roadIds: string[];
  freeRoadIds: string[];
  shipIds: string[];
  freeShipIds: string[];
  movableShipIds: string[];
  shipMoveTargets: Record<string, string[]>;
  pirateTargetHexIds: string[];
  cityVertexIds: string[];
  tradeRatios: Record<Resource, number>;
  robberHexIds: string[];
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

async function findGame(
  ctx: QueryCtx | MutationCtx,
  roomId: RoomDocument["_id"],
): Promise<GameStateDocument | null> {
  return await ctx.db
    .query("gameStates")
    .withIndex("by_room", (index) => index.eq("roomId", roomId))
    .unique();
}

async function requireGame(
  ctx: QueryCtx | MutationCtx,
  room: RoomDocument,
): Promise<GameStateDocument> {
  const game = room.gameId
    ? await ctx.db.get("gameStates", room.gameId)
    : await findGame(ctx, room._id);
  if (!game) fail("GAME_NOT_RUNNING", "La sala todavía no tiene una partida en curso.");
  return game;
}

async function requireBoard(
  ctx: QueryCtx | MutationCtx,
  room: RoomDocument,
): Promise<Board> {
  const boardDoc = room.boardId
    ? await ctx.db.get("gameBoards", room.boardId)
    : await ctx.db
        .query("gameBoards")
        .withIndex("by_room", (index) => index.eq("roomId", room._id))
        .unique();
  if (!boardDoc) fail("GAME_NOT_RUNNING", "La sala todavía no tiene una partida en curso.");
  return boardDoc.board as Board;
}

async function loadPrivateStates(
  ctx: QueryCtx | MutationCtx,
  roomId: RoomDocument["_id"],
): Promise<Record<string, StoredPrivatePlayerState>> {
  const docs = await ctx.db
    .query("playerStates")
    .withIndex("by_room", (index) => index.eq("roomId", roomId))
    .take(8);
  const states: Record<string, StoredPrivatePlayerState> = {};
  for (const doc of docs) {
    states[doc.playerId] = {
      resources: doc.resources as ResourceBundle,
      developmentCards: doc.developmentCards as HeldDevelopmentCard[],
    };
  }
  return states;
}

function gameFlowFromGame(
  game: GameStateDocument,
  board: Board,
  privateStates: Record<string, StoredPrivatePlayerState>,
): GameFlow | null {
  const publicState = game.public as StoredPublicState | undefined;
  if (!publicState) return null;
  return {
    state: joinGameState(publicState, board, privateStates),
    turnStartedAt: game.turnStartedAt ?? null,
    turnDeadlineAt: game.turnDeadlineAt ?? null,
    turnResumeRemainingMs: game.turnResumeRemainingMs ?? null,
    tradeRespondDeadlineAt: game.tradeRespondDeadlineAt ?? null,
    turnStats: { ...(game.turnStats ?? {}) },
  };
}

function computeLegal(state: GameState, playerId: string): LegalPlacements {
  const movableShipIds = getMovableShipIds(state, playerId);
  return {
    settlementVertexIds: getLegalSettlementPlacements(state, playerId),
    roadIds: getLegalRoadPlacements(state, playerId),
    freeRoadIds: getLegalRoadPlacements(state, playerId, { free: true }),
    shipIds: getLegalShipPlacements(state, playerId),
    freeShipIds: getLegalShipPlacements(state, playerId, { free: true }),
    movableShipIds,
    shipMoveTargets: Object.fromEntries(
      movableShipIds.map((edgeId) => [
        edgeId,
        getLegalShipMoveTargets(state, playerId, edgeId),
      ]),
    ),
    pirateTargetHexIds: state.board.hexes
      .filter(
        (hex) =>
          hex.terrain === "sea" &&
          !(
            state.piratePosition?.kind === "hex" &&
            state.piratePosition.hexId === hex.id
          ),
      )
      .map((hex) => hex.id),
    cityVertexIds: getLegalCityUpgrades(state, playerId),
    tradeRatios: {
      wood: getMaritimeTradeRatio(state, playerId, "wood"),
      brick: getMaritimeTradeRatio(state, playerId, "brick"),
      sheep: getMaritimeTradeRatio(state, playerId, "sheep"),
      wheat: getMaritimeTradeRatio(state, playerId, "wheat"),
      ore: getMaritimeTradeRatio(state, playerId, "ore"),
    },
    robberHexIds: state.board.hexes
      .filter((hex) => hex.id !== state.robberHexId && hex.terrain !== "sea")
      .map((hex) => hex.id),
  };
}

function computeLongestRoads(state: GameState): Record<string, number> {
  const lengths: Record<string, number> = {};
  for (const player of state.players) {
    lengths[player.id] = calculateLongestRoad(state, player.id);
  }
  return lengths;
}

async function ensurePlayerStates(
  ctx: MutationCtx,
  roomId: RoomDocument["_id"],
  state: GameState,
  privateStates: Record<string, StoredPrivatePlayerState>,
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("playerStates")
    .withIndex("by_room", (index) => index.eq("roomId", roomId))
    .take(8);
  const byPlayer = new Map(existing.map((doc) => [doc.playerId, doc]));

  for (const player of state.players) {
    const privateState = privateStates[player.id];
    if (!privateState) continue;
    const hiddenVictoryPoints = privateState.developmentCards.filter(
      (card) => card.type === "victory-point",
    ).length;
    const publicVictoryPoints = getPublicVictoryPoints(state, player.id);
    const next = {
      resources: privateState.resources,
      developmentCards: privateState.developmentCards,
      legal: computeLegal(state, player.id),
      publicVictoryPoints,
      hiddenVictoryPoints,
      totalVictoryPoints: publicVictoryPoints + hiddenVictoryPoints,
      pendingDiscardCount: state.pendingDiscards[player.id] ?? 0,
      pendingGoldCount: state.pendingGoldChoices[player.id] ?? 0,
    };
    const doc = byPlayer.get(player.id);
    if (!doc) {
      await ctx.db.insert("playerStates", {
        roomId,
        playerId: player.id,
        ...next,
        updatedAt: now,
      });
      continue;
    }
    const unchanged =
      JSON.stringify(doc.resources) === JSON.stringify(next.resources) &&
      JSON.stringify(doc.developmentCards) === JSON.stringify(next.developmentCards) &&
      JSON.stringify(doc.legal) === JSON.stringify(next.legal) &&
      doc.publicVictoryPoints === next.publicVictoryPoints &&
      doc.hiddenVictoryPoints === next.hiddenVictoryPoints &&
      doc.totalVictoryPoints === next.totalVictoryPoints &&
      doc.pendingDiscardCount === next.pendingDiscardCount &&
      doc.pendingGoldCount === next.pendingGoldCount;
    if (!unchanged) await ctx.db.patch(doc._id, { ...next, updatedAt: now });
  }
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
    if (lastSeenAt - previous.lastSeenAt < PRESENCE_WRITE_THROTTLE_MS) return;
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
    case "activate-robber":
      return `${playerName} decidió mover al ladrón.`;
    case "activate-pirate":
      return `${playerName} decidió mover al pirata.`;
    case "move-pirate":
      return `${playerName} movió al pirata${action.hexId === null ? " al marco" : ""}.`;
    case "choose-pirate-victim": {
      const victimName =
        nextState.players.find((player) => player.id === action.victimId)?.name ?? "un rival";
      return `${playerName} le robó una carta a ${victimName} con el pirata.`;
    }
    case "choose-gold":
      return `${playerName} eligió recursos de un campo de oro.`;
    case "build-ship":
      return `${playerName} construyó un barco.`;
    case "move-ship":
      return `${playerName} movió un barco.`;
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

function isGamePaused(game: GameStateDocument): boolean {
  return game.pausedAt !== undefined && game.pausedAt !== null;
}

function botsNeedingDiscard(room: RoomDocument, state: GameState): string[] {
  return Object.keys(state.pendingDiscards)
    .filter((playerId) => isBotPlayer(room, playerId))
    .sort();
}

function botsNeedingGold(room: RoomDocument, state: GameState): string[] {
  return Object.keys(state.pendingGoldChoices)
    .filter((playerId) => isBotPlayer(room, playerId))
    .sort();
}

function botActionKey(room: RoomDocument, state: GameState): string | null {
  const discards = botsNeedingDiscard(room, state);
  const goldChoices = botsNeedingGold(room, state);
  const actingPlayerId = playerIdAt(state);
  if (discards.length === 0 && goldChoices.length === 0 && !isBotPlayer(room, actingPlayerId)) {
    return null;
  }
  return [
    state.turnNumber,
    state.phase,
    actingPlayerId,
    discards.join("+"),
    goldChoices.join("+"),
  ].join(":");
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
    state.board.hexes
      .filter((hex) => hex.id !== state.robberHexId && hex.terrain !== "sea")
      .map((hex) => hex.id),
  );
  return hexId ? { type: "move-robber", playerId, hexId, victimId: null } : null;
}

function randomVictimAction(state: GameState, playerId: string): GameAction | null {
  const pending = state.pendingRobberVictim;
  const victimId = pending ? randomItem(pending.victimIds) : null;
  return victimId ? { type: "choose-robber-victim", playerId, victimId } : null;
}

function randomPirateVictimAction(state: GameState, playerId: string): GameAction | null {
  const pending = state.pendingPirateVictim;
  const victimId = pending ? randomItem(pending.victimIds) : null;
  return victimId ? { type: "choose-pirate-victim", playerId, victimId } : null;
}

function randomGoldBundle(state: GameState, playerId: string, count: number): Resource[] {
  const available: Resource[] = [];
  for (const resource of RESOURCES) {
    for (let index = 0; index < state.bank[resource]; index += 1) available.push(resource);
  }
  const picks: Resource[] = [];
  for (let index = 0; index < count && available.length > 0; index += 1) {
    const [resource] = available.splice(Math.floor(Math.random() * available.length), 1);
    if (resource) picks.push(resource);
  }
  while (picks.length < count) picks.push("wood");
  return picks;
}

function randomPirateMoveAction(state: GameState, playerId: string): GameAction | null {
  const currentHexId =
    state.piratePosition?.kind === "hex" ? state.piratePosition.hexId : null;
  const targets = state.board.hexes
    .filter((hex) => hex.terrain === "sea" && hex.id !== currentHexId)
    .map((hex) => hex.id);
  const hexId = randomItem(targets);
  if (hexId) return { type: "move-pirate", playerId, hexId };
  if (state.piratePosition?.kind === "hex") {
    return { type: "move-pirate", playerId, hexId: null };
  }
  return null;
}

function botTurnAction(state: GameState, playerId: string): GameAction | null {
  switch (state.phase) {
    case "setup-settlement": {
      const vertexId = randomItem(getLegalSettlementPlacements(state, playerId));
      return vertexId ? { type: "place-setup-settlement", playerId, vertexId } : null;
    }
    case "setup-road": {
      const roadId = randomItem(getLegalRoadPlacements(state, playerId));
      const shipId = randomItem(getLegalShipPlacements(state, playerId));
      if (roadId && (shipId === null || Math.random() < 0.5)) {
        return { type: "place-setup-road", playerId, edgeId: roadId, kind: "road" };
      }
      if (shipId) return { type: "place-setup-road", playerId, edgeId: shipId, kind: "ship" };
      return roadId ? { type: "place-setup-road", playerId, edgeId: roadId, kind: "road" } : null;
    }
    case "awaiting-roll":
      return { type: "roll", playerId };
    case "activate":
      return Math.random() < 0.5
        ? { type: "activate-robber", playerId }
        : { type: "activate-pirate", playerId };
    case "robber":
      return randomRobberHexAction(state, playerId);
    case "robber-victim":
      return randomVictimAction(state, playerId);
    case "pirate":
      return randomPirateMoveAction(state, playerId);
    case "pirate-victim":
      return randomPirateVictimAction(state, playerId);
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
    case "activate":
    case "robber":
    case "robber-victim":
    case "pirate":
    case "pirate-victim":
      return botTurnAction(state, playerId);
    case "gold": {
      const goldPlayerId = Object.keys(state.pendingGoldChoices)[0];
      if (!goldPlayerId) return null;
      return {
        type: "choose-gold",
        playerId: goldPlayerId,
        resources: randomGoldBundle(
          state,
          goldPlayerId,
          state.pendingGoldChoices[goldPlayerId]!,
        ),
      };
    }
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
      return "setup-settlement";
    case "setup-road":
      return "setup-road";
    case "awaiting-roll":
      return "roll";
    case "discard":
      return "discard";
    case "gold":
      return "discard";
    case "activate":
    case "robber":
    case "pirate":
      return "robber";
    case "robber-victim":
    case "pirate-victim":
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
    case "setup-settlement":
      return SETUP_SETTLEMENT_WINDOW_MS;
    case "setup-road":
      return SETUP_ROAD_WINDOW_MS;
    case "roll":
      return ROLL_WINDOW_MS;
    case "discard":
      return DISCARD_WINDOW_MS;
    case "robber":
    case "robber-victim":
      return ROBBER_WINDOW_MS;
    case "trade":
      return OFFER_WINDOW_MS;
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
    case "setup-settlement":
      return "Se agotó el tiempo para colocar el poblado inicial; se colocó al azar.";
    case "setup-road":
      return "Se agotó el tiempo para colocar el camino inicial; se colocó al azar.";
    case "main":
      return `Se agotó el tiempo de ${playerName}; se pasó el turno.`;
    case "finished":
      return "";
  }
}

async function commitGameFlow(
  ctx: MutationCtx,
  room: RoomDocument,
  game: GameStateDocument,
  flow: GameFlow,
  events: FlowEvent[] = [],
): Promise<void> {
  const now = Date.now();
  const finished = flow.state.phase === "finished";
  const botKey = finished ? null : botActionKey(room, flow.state);
  const { publicState, privateStates } = splitGameState(flow.state);

  await ctx.db.patch(game._id, {
    public: publicState,
    longestRoadLengths: computeLongestRoads(flow.state),
    turnStartedAt: flow.turnStartedAt ?? undefined,
    turnDeadlineAt: flow.turnDeadlineAt ?? undefined,
    turnResumeRemainingMs: flow.turnResumeRemainingMs ?? undefined,
    tradeRespondDeadlineAt: flow.tradeRespondDeadlineAt ?? undefined,
    turnStats: flow.turnStats,
    botTurnKey: botKey ?? undefined,
    updatedAt: now,
  });

  await ensurePlayerStates(ctx, room._id, flow.state, privateStates);

  if (finished && room.status !== "finished") {
    await ctx.db.patch(room._id, { status: "finished", updatedAt: now });
  } else if (!finished && room.status !== "playing") {
    await ctx.db.patch(room._id, { status: "playing", updatedAt: now });
  }

  for (const event of events) {
    await writeEvent(ctx, room, event.actorId, event.actorName, event.kind, event.message);
  }

  if (
    flow.turnDeadlineAt !== null &&
    flow.turnDeadlineAt !== (game.turnDeadlineAt ?? null)
  ) {
    await ctx.scheduler.runAfter(
      Math.max(0, flow.turnDeadlineAt - now),
      internal.rooms.enforceTurnTimeout,
      {
        gameId: game._id,
        expectedDeadline: flow.turnDeadlineAt,
      },
    );
  }

  if (
    flow.tradeRespondDeadlineAt !== null &&
    flow.tradeRespondDeadlineAt !== (game.tradeRespondDeadlineAt ?? null)
  ) {
    await ctx.scheduler.runAfter(
      Math.max(0, flow.tradeRespondDeadlineAt - now),
      internal.rooms.expireTradeResponses,
      {
        gameId: game._id,
        expectedDeadline: flow.tradeRespondDeadlineAt,
      },
    );
  }

  if (botKey !== null && (game.botTurnKey ?? null) !== botKey) {
    await ctx.scheduler.runAfter(BOT_ACTION_DELAY_MS, internal.rooms.playBotTurn, {
      gameId: game._id,
      expectedKey: botKey,
    });
  }
}

async function applyPauseOutcome(
  ctx: MutationCtx,
  room: RoomDocument,
  game: GameStateDocument,
  request: { mode: "pause" | "resume"; requestedBy: string },
  event?: { actorId?: string | null; actorName?: string; message?: string },
): Promise<void> {
  const now = Date.now();
  const actorName = playerName(room, request.requestedBy);

  if (request.mode === "pause") {
    await ctx.db.patch(game._id, {
      pauseRequest: null,
      pausedAt: now,
      pauseRemainingMs:
        game.turnDeadlineAt !== undefined && game.turnDeadlineAt !== null
          ? Math.max(0, game.turnDeadlineAt - now)
          : null,
      pauseTradeRemainingMs:
        game.tradeRespondDeadlineAt !== undefined && game.tradeRespondDeadlineAt !== null
          ? Math.max(0, game.tradeRespondDeadlineAt - now)
          : null,
      turnDeadlineAt: undefined,
      tradeRespondDeadlineAt: undefined,
      updatedAt: now,
    });
    await writeEvent(
      ctx,
      room,
      event?.actorId ?? request.requestedBy,
      event?.actorName ?? actorName,
      "system",
      event?.message ?? "La partida se pausó.",
    );
    return;
  }

  const behavior = await readGameBehavior(ctx, room, game);
  if (!behavior) return;
  const { flow } = behavior;
  const pausedAt = game.pausedAt ?? now;
  const pauseDuration = Math.max(0, now - pausedAt);
  flow.turnStartedAt = flow.turnStartedAt !== null ? flow.turnStartedAt + pauseDuration : null;
  flow.turnDeadlineAt =
    game.pauseRemainingMs !== undefined && game.pauseRemainingMs !== null
      ? now + game.pauseRemainingMs
      : null;
  flow.tradeRespondDeadlineAt =
    game.pauseTradeRemainingMs !== undefined && game.pauseTradeRemainingMs !== null
      ? now + game.pauseTradeRemainingMs
      : null;

  await ctx.db.patch(game._id, {
    pauseRequest: null,
    pausedAt: null,
    pauseRemainingMs: null,
    pauseTradeRemainingMs: null,
    updatedAt: now,
  });
  await writeEvent(ctx, room, request.requestedBy, actorName, "system", "La partida se reanudó.");
  const { botTurnKey: _botTurnKey, ...gameWithoutBotKey } = game;
  await commitGameFlow(ctx, room, gameWithoutBotKey, flow);
}

async function readGameBehavior(
  ctx: QueryCtx | MutationCtx,
  room: RoomDocument,
  game: GameStateDocument,
): Promise<{ flow: GameFlow; board: Board } | null> {
  const board = await requireBoard(ctx, room);
  const privateStates = await loadPrivateStates(ctx, room._id);
  const flow = gameFlowFromGame(game, board, privateStates);
  if (!flow) return null;
  return { flow, board };
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

export const setExpansion = mutation({
  args: {
    code: v.string(),
    playerToken: v.string(),
    expansion: v.union(v.literal("base"), v.literal("seafarers")),
  },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La sala ya no está en el lobby.");
    if (member.id !== room.hostPlayerId) {
      fail("HOST_ONLY", "Solo quien creó la sala puede elegir la expansión.");
    }
    const expansion = args.expansion;
    if (expansion === "seafarers") {
      await ctx.db.patch(room._id, {
        expansion,
        scenario: room.scenario ?? SCENARIOS[0]!.id,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(room._id, { expansion, updatedAt: Date.now() });
    }
    return { expansion };
  },
});

export const setScenario = mutation({
  args: { code: v.string(), playerToken: v.string(), scenario: v.string() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La sala ya no está en el lobby.");
    if (member.id !== room.hostPlayerId) {
      fail("HOST_ONLY", "Solo quien creó la sala puede elegir el mapa.");
    }
    if (!SCENARIOS.some((scenario) => scenario.id === args.scenario)) {
      fail("UNKNOWN_SCENARIO", "Ese mapa no existe.");
    }
    await ctx.db.patch(room._id, {
      expansion: "seafarers",
      scenario: args.scenario,
      updatedAt: Date.now(),
    });
    return { scenario: args.scenario };
  },
});

export const setSetupMode = mutation({
  args: {
    code: v.string(),
    playerToken: v.string(),
    setupMode: v.union(v.literal("fixed"), v.literal("variable")),
  },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La sala ya no está en el lobby.");
    if (member.id !== room.hostPlayerId) {
      fail("HOST_ONLY", "Solo quien creó la sala puede elegir el modo de mapa.");
    }
    await ctx.db.patch(room._id, { setupMode: args.setupMode, updatedAt: Date.now() });
    return { setupMode: args.setupMode };
  },
});

export const setMainIslandNoGold = mutation({
  args: { code: v.string(), playerToken: v.string(), value: v.boolean() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "lobby") fail("ROOM_ALREADY_STARTED", "La sala ya no está en el lobby.");
    if (member.id !== room.hostPlayerId) {
      fail("HOST_ONLY", "Solo quien creó la sala puede cambiar esta opción.");
    }
    await ctx.db.patch(room._id, { mainIslandNoGold: args.value, updatedAt: Date.now() });
    return { mainIslandNoGold: args.value };
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

    const expansion = room.expansion ?? "base";
    const scenarioId = expansion === "seafarers" ? (room.scenario ?? SCENARIOS[0]!.id) : undefined;
    if (expansion === "seafarers" && !SCENARIOS.some((scenario) => scenario.id === scenarioId)) {
      fail("UNKNOWN_SCENARIO", "El mapa elegido no existe.");
    }
    const gameState = createGame({
      players: shufflePlayers(room.players.map(({ id, name }) => ({ id, name }))),
      seed: String(room._id),
      ...(scenarioId ? { scenarioId } : {}),
      setupMode: room.setupMode ?? "fixed",
      mainIslandNoGold: room.mainIslandNoGold ?? false,
    });
    const now = Date.now();
    const limitSeconds = room.turnTimeLimitSeconds ?? DEFAULT_TURN_TIME_LIMIT_SECONDS;
    const turnDeadlineAt = deadlineFor("setup-settlement", now, limitSeconds);
    const { board, publicState, privateStates } = splitGameState(gameState);

    const boardId = await ctx.db.insert("gameBoards", { roomId: room._id, board });
    const gameId = await ctx.db.insert("gameStates", {
      roomId: room._id,
      public: publicState,
      longestRoadLengths: computeLongestRoads(gameState),
      turnStartedAt: now,
      turnResumeRemainingMs: null,
      tradeRespondDeadlineAt: null,
      turnStats: {},
      updatedAt: now,
    });
    await ensurePlayerStates(ctx, room._id, gameState, privateStates);
    await ctx.db.patch(room._id, { status: "playing", boardId, gameId, updatedAt: now });

    await writeEvent(ctx, room, member.id, member.name, "system", "La partida comenzó.");
    await writeEvent(
      ctx,
      room,
      member.id,
      member.name,
      "system",
      `Orden de turnos: ${gameState.players.map((player) => player.name).join(" → ")}.`,
    );

    const game = await ctx.db.get("gameStates", gameId);
    if (game) {
      await commitGameFlow(ctx, room, game, {
        state: gameState,
        turnStartedAt: now,
        turnDeadlineAt,
        turnResumeRemainingMs: null,
        tradeRespondDeadlineAt: null,
        turnStats: {},
      });
    }
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

    return {
      roomId: room._id,
      boardId: room.boardId ?? null,
      gameId: room.gameId ?? null,
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
      })),
      turnTimeLimitSeconds: room.turnTimeLimitSeconds ?? DEFAULT_TURN_TIME_LIMIT_SECONDS,
      expansion: room.expansion ?? "base",
      scenario: room.scenario ?? null,
      setupMode: room.setupMode ?? "fixed",
      mainIslandNoGold: room.mainIslandNoGold ?? false,
    };
  },
});

export const getBoard = query({
  args: { boardId: v.id("gameBoards") },
  handler: async (ctx, args) => {
    const boardDoc = await ctx.db.get("gameBoards", args.boardId);
    return boardDoc ? (boardDoc.board as Board) : null;
  },
});

export const getGame = query({
  args: { gameId: v.id("gameStates") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get("gameStates", args.gameId);
    if (!game) return null;
    const publicState = game.public as StoredPublicState | undefined;
    if (!publicState) return null;
    return {
      view: buildPublicGameView(publicState, game.longestRoadLengths),
      turnDeadlineAt: game.turnDeadlineAt ?? null,
      tradeRespondDeadlineAt: game.tradeRespondDeadlineAt ?? null,
      pausedAt: game.pausedAt ?? null,
      pauseRemainingMs: game.pauseRemainingMs ?? null,
      pauseRequest: game.pauseRequest ?? null,
      turnStats: game.turnStats ?? {},
    };
  },
});

export const getSelf = query({
  args: { roomId: v.id("rooms"), playerToken: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get("rooms", args.roomId);
    if (!room) return null;
    const member = room.players.find((player) => player.token === args.playerToken);
    if (!member) return null;
    const playerState = await ctx.db
      .query("playerStates")
      .withIndex("by_room_and_player", (index) =>
        index.eq("roomId", args.roomId).eq("playerId", member.id),
      )
      .unique();
    if (!playerState) return null;
    return {
      view: {
        resources: playerState.resources as ResourceBundle,
        developmentCards: playerState.developmentCards as HeldDevelopmentCard[],
        hiddenVictoryPoints: playerState.hiddenVictoryPoints,
        totalVictoryPoints: playerState.totalVictoryPoints,
        pendingDiscardCount: playerState.pendingDiscardCount,
        pendingGoldCount: playerState.pendingGoldCount,
      },
      legal: playerState.legal as LegalPlacements,
    };
  },
});

export const getPresence = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_room", (index) => index.eq("roomId", args.roomId))
      .take(16);
    return presence.map((entry) => entry.playerId);
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
      const rows = await ctx.db
        .query("presence")
        .withIndex("by_room", (index) => index.eq("roomId", room._id))
        .take(16);
      for (const row of rows) await ctx.db.delete(row._id);
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_room_created_at", (index) => index.eq("roomId", room._id))
        .take(100);
      for (const message of messages) await ctx.db.delete(message._id);
      const events = await ctx.db
        .query("gameEvents")
        .withIndex("by_room_created_at", (index) => index.eq("roomId", room._id))
        .take(100);
      for (const event of events) await ctx.db.delete(event._id);
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
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_room_created_at", (index) => index.eq("roomId", args.roomId))
      .order("desc")
      .take(FEED_LIMIT);
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
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("gameEvents")
      .withIndex("by_room_created_at", (index) => index.eq("roomId", args.roomId))
      .order("desc")
      .take(FEED_LIMIT);
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
    if (room.status !== "playing") {
      fail("GAME_NOT_RUNNING", "La sala todavía no tiene una partida en curso.");
    }
    const game = await requireGame(ctx, room);
    if (isGamePaused(game)) {
      fail("GAME_PAUSED", "La partida está en pausa; reanúdenla para seguir jugando.");
    }
    const behavior = await readGameBehavior(ctx, room, game);
    if (!behavior) fail("GAME_NOT_RUNNING", "La sala todavía no tiene una partida en curso.");
    const { flow } = behavior;

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

    await commitGameFlow(ctx, room, game, next, [actionEvent(action, member.name, next.state)]);
    return { phase: next.state.phase, winnerId: next.state.winnerId };
  },
});

export const requestPause = mutation({
  args: {
    code: v.string(),
    playerToken: v.string(),
    mode: v.union(v.literal("pause"), v.literal("resume")),
  },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    if (room.status !== "playing") {
      fail("GAME_NOT_RUNNING", "La sala todavía no tiene una partida en curso.");
    }
    const game = await requireGame(ctx, room);
    const paused = isGamePaused(game);
    if (args.mode === "pause" && paused) fail("ALREADY_PAUSED", "La partida ya está en pausa.");
    if (args.mode === "resume" && !paused) fail("NOT_PAUSED", "La partida no está en pausa.");
    if (game.pauseRequest) fail("PAUSE_VOTE_ACTIVE", "Ya hay una votación en curso.");

    const votes: Record<string, boolean> = {};
    for (const player of room.players) {
      if (player.id === member.id || player.isBot === true) votes[player.id] = true;
    }
    const request = {
      mode: args.mode,
      requestedBy: member.id,
      votes,
      createdAt: Date.now(),
    };
    const label = args.mode === "pause" ? "pausar la partida" : "reanudar la partida";
    await writeEvent(ctx, room, member.id, member.name, "system", `${member.name} propuso ${label}.`);

    if (room.players.every((player) => votes[player.id] === true)) {
      await applyPauseOutcome(ctx, room, game, request);
    } else {
      await ctx.db.patch(game._id, { pauseRequest: request, updatedAt: Date.now() });
    }
    return { requested: true };
  },
});

export const votePause = mutation({
  args: { code: v.string(), playerToken: v.string(), approve: v.boolean() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    const game = await requireGame(ctx, room);
    const request = game.pauseRequest;
    if (!request) fail("NO_PAUSE_VOTE", "No hay una votación de pausa en curso.");
    const now = Date.now();

    if (!args.approve) {
      await ctx.db.patch(game._id, { pauseRequest: null, updatedAt: now });
      await writeEvent(
        ctx,
        room,
        member.id,
        member.name,
        "system",
        `${member.name} rechazó la propuesta.`,
      );
      return { approved: false };
    }

    const votes = { ...request.votes, [member.id]: true };
    if (room.players.every((player) => votes[player.id] === true)) {
      await applyPauseOutcome(ctx, room, game, {
        mode: request.mode,
        requestedBy: request.requestedBy,
      });
    } else {
      await ctx.db.patch(game._id, { pauseRequest: { ...request, votes }, updatedAt: now });
    }
    return { approved: true };
  },
});

export const cancelPauseRequest = mutation({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const { room, member } = await requireRoomMember(ctx, args.code, args.playerToken);
    const game = await requireGame(ctx, room);
    const request = game.pauseRequest;
    if (!request) fail("NO_PAUSE_VOTE", "No hay una votación en curso.");
    if (request.requestedBy !== member.id && member.id !== room.hostPlayerId) {
      fail("UNAUTHORIZED", "Solo quien la propuso o el anfitrión pueden cancelarla.");
    }
    await ctx.db.patch(game._id, { pauseRequest: null, updatedAt: Date.now() });
    await writeEvent(
      ctx,
      room,
      member.id,
      member.name,
      "system",
      `${member.name} canceló la votación.`,
    );
    return { cancelled: true };
  },
});

export const playBotTurn = internalMutation({
  args: { gameId: v.id("gameStates"), expectedKey: v.string() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get("gameStates", args.gameId);
    if (!game || isGamePaused(game)) return null;
    const room = await ctx.db.get("rooms", game.roomId);
    if (!room || room.status !== "playing") return null;
    const behavior = await readGameBehavior(ctx, room, game);
    if (!behavior) return null;
    let { flow } = behavior;
    if (botActionKey(room, flow.state) !== args.expectedKey) return null;

    const actingPlayerId = playerIdAt(flow.state);
    const events: FlowEvent[] = [];
    for (let step = 0; step < MAX_BOT_ACTIONS_PER_RUN; step += 1) {
      const discardPlayerId = botsNeedingDiscard(room, flow.state)[0];
      const goldPlayerId = botsNeedingGold(room, flow.state)[0];
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
          : goldPlayerId !== undefined
            ? {
                type: "choose-gold" as const,
                playerId: goldPlayerId,
                resources: randomGoldBundle(
                  flow.state,
                  goldPlayerId,
                  flow.state.pendingGoldChoices[goldPlayerId]!,
                ),
              }
            : playerIdAt(flow.state) === actingPlayerId && isBotPlayer(room, actingPlayerId)
              ? botTurnAction(flow.state, actingPlayerId)
              : null;
      if (!action) break;

      flow = advanceGameFlow(room, flow, action);
      events.push(actionEvent(action, playerName(room, action.playerId), flow.state));
      if (flow.state.phase === "finished") break;
      if (
        playerIdAt(flow.state) !== actingPlayerId &&
        flow.state.phase !== "discard" &&
        flow.state.phase !== "gold"
      ) {
        break;
      }
    }

    if (events.length === 0) return null;
    await commitGameFlow(ctx, room, game, flow, events);
    return null;
  },
});

export const enforceTurnTimeout = internalMutation({
  args: { gameId: v.id("gameStates"), expectedDeadline: v.number() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get("gameStates", args.gameId);
    if (!game || isGamePaused(game)) return null;
    if (game.turnDeadlineAt !== args.expectedDeadline) return null;
    const now = Date.now();
    if (now < args.expectedDeadline) {
      await ctx.scheduler.runAfter(
        args.expectedDeadline - now,
        internal.rooms.enforceTurnTimeout,
        args,
      );
      return null;
    }
    const room = await ctx.db.get("rooms", game.roomId);
    if (!room || room.status !== "playing") return null;
    const behavior = await readGameBehavior(ctx, room, game);
    if (!behavior) return null;
    let { flow } = behavior;

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

    await commitGameFlow(ctx, room, game, flow, events);
    return null;
  },
});

export const expireTradeResponses = internalMutation({
  args: { gameId: v.id("gameStates"), expectedDeadline: v.number() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get("gameStates", args.gameId);
    if (!game || isGamePaused(game)) return null;
    if (game.tradeRespondDeadlineAt !== args.expectedDeadline) return null;
    const now = Date.now();
    if (now < args.expectedDeadline) {
      await ctx.scheduler.runAfter(
        args.expectedDeadline - now,
        internal.rooms.expireTradeResponses,
        args,
      );
      return null;
    }
    const room = await ctx.db.get("rooms", game.roomId);
    if (!room || room.status !== "playing") return null;
    const behavior = await readGameBehavior(ctx, room, game);
    if (!behavior) return null;
    let { flow } = behavior;
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

    await commitGameFlow(ctx, room, game, flow, events);
    return null;
  },
});

async function autoPauseDisconnectedRoom(
  ctx: MutationCtx,
  roomId: RoomDocument["_id"],
): Promise<void> {
  const room = await ctx.db.get("rooms", roomId);
  if (!room || room.status !== "playing") return;
  const humans = room.players.filter((player) => player.isBot !== true);
  if (humans.length === 0) return;

  const presence = await ctx.db
    .query("presence")
    .withIndex("by_room", (index) => index.eq("roomId", roomId))
    .take(MAX_ROOM_PLAYERS);
  const online = new Set(presence.map((row) => row.playerId));
  if (humans.some((player) => online.has(player.id))) return;

  const game = await ctx.db
    .query("gameStates")
    .withIndex("by_room", (index) => index.eq("roomId", roomId))
    .unique();
  if (!game || isGamePaused(game)) return;

  await applyPauseOutcome(
    ctx,
    room,
    game,
    { mode: "pause", requestedBy: room.hostPlayerId },
    {
      actorId: null,
      actorName: "Mesa",
      message: "La partida se pausó automáticamente: todos los jugadores se desconectaron.",
    },
  );
}

export const cleanupPresence = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PRESENCE_STALE_MS;
    const stale = await ctx.db
      .query("presence")
      .withIndex("by_lastSeenAt", (index) => index.lt("lastSeenAt", cutoff))
      .take(100);
    const affectedRoomIds = new Set(stale.map((row) => row.roomId));
    for (const row of stale) await ctx.db.delete(row._id);
    for (const roomId of affectedRoomIds) await autoPauseDisconnectedRoom(ctx, roomId);
    return null;
  },
});
