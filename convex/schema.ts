import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const turnStatValidator = v.object({
  totalMs: v.number(),
  turns: v.number(),
  lastTurnMs: v.number(),
});

const pauseRequestValidator = v.union(
  v.object({
    mode: v.union(v.literal("pause"), v.literal("resume")),
    requestedBy: v.string(),
    votes: v.record(v.string(), v.boolean()),
    createdAt: v.number(),
  }),
  v.null(),
);

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    status: v.union(
      v.literal("lobby"),
      v.literal("playing"),
      v.literal("finished"),
    ),
    hostPlayerId: v.string(),
    players: v.array(
      v.object({
        id: v.string(),
        token: v.string(),
        name: v.string(),
        ready: v.boolean(),
        joinedAt: v.number(),
        isBot: v.optional(v.boolean()),
      }),
    ),
    expansion: v.optional(v.union(v.literal("base"), v.literal("seafarers"))),
    scenario: v.optional(v.string()),
    setupMode: v.optional(v.union(v.literal("fixed"), v.literal("variable"))),
    turnTimeLimitSeconds: v.optional(v.number()),
    boardId: v.optional(v.id("gameBoards")),
    gameId: v.optional(v.id("gameStates")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),

  gameBoards: defineTable({
    roomId: v.id("rooms"),
    board: v.any(),
  }).index("by_room", ["roomId"]),

  gameStates: defineTable({
    roomId: v.id("rooms"),
    public: v.any(),
    longestRoadLengths: v.record(v.string(), v.number()),
    turnStartedAt: v.optional(v.union(v.number(), v.null())),
    turnDeadlineAt: v.optional(v.union(v.number(), v.null())),
    turnResumeRemainingMs: v.optional(v.union(v.number(), v.null())),
    tradeRespondDeadlineAt: v.optional(v.union(v.number(), v.null())),
    turnStats: v.optional(v.record(v.string(), turnStatValidator)),
    botTurnKey: v.optional(v.union(v.string(), v.null())),
    pausedAt: v.optional(v.union(v.number(), v.null())),
    pauseRemainingMs: v.optional(v.union(v.number(), v.null())),
    pauseTradeRemainingMs: v.optional(v.union(v.number(), v.null())),
    pauseRequest: v.optional(pauseRequestValidator),
    updatedAt: v.number(),
  }).index("by_room", ["roomId"]),

  playerStates: defineTable({
    roomId: v.id("rooms"),
    playerId: v.string(),
    resources: v.any(),
    developmentCards: v.any(),
    legal: v.any(),
    publicVictoryPoints: v.number(),
    hiddenVictoryPoints: v.number(),
    totalVictoryPoints: v.number(),
    pendingDiscardCount: v.number(),
    pendingGoldCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_and_player", ["roomId", "playerId"]),

  presence: defineTable({
    roomId: v.id("rooms"),
    playerId: v.string(),
    lastSeenAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_player", ["roomId", "playerId"])
    .index("by_lastSeenAt", ["lastSeenAt"]),

  messages: defineTable({
    roomId: v.id("rooms"),
    playerId: v.string(),
    playerName: v.string(),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_room_created_at", ["roomId", "createdAt"]),

  gameEvents: defineTable({
    roomId: v.id("rooms"),
    actorId: v.union(v.string(), v.null()),
    actorName: v.string(),
    kind: v.union(v.literal("system"), v.literal("action")),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_room_created_at", ["roomId", "createdAt"]),
});
