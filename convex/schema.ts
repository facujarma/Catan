import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    gameState: v.optional(v.any()),
    turnTimeLimitSeconds: v.optional(v.number()),
    turnStartedAt: v.optional(v.number()),
    turnDeadlineAt: v.optional(v.number()),
    turnResumeRemainingMs: v.optional(v.number()),
    tradeRespondDeadlineAt: v.optional(v.number()),
    turnStats: v.optional(
      v.record(
        v.string(),
        v.object({
          totalMs: v.number(),
          turns: v.number(),
          lastTurnMs: v.number(),
        }),
      ),
    ),
    botTurnKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  presence: defineTable({
    roomId: v.id("rooms"),
    playerId: v.string(),
    lastSeenAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_player", ["roomId", "playerId"]),

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
