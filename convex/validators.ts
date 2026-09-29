import { v } from "convex/values";

const resourceValidator = v.union(
  v.literal("wood"),
  v.literal("brick"),
  v.literal("sheep"),
  v.literal("wheat"),
  v.literal("ore"),
);

export const resourceBundleValidator = v.object({
  wood: v.number(),
  brick: v.number(),
  sheep: v.number(),
  wheat: v.number(),
  ore: v.number(),
});

export const gameActionValidator = v.union(
  v.object({ type: v.literal("place-setup-settlement"), vertexId: v.string() }),
  v.object({ type: v.literal("place-setup-road"), edgeId: v.string() }),
  v.object({ type: v.literal("roll") }),
  v.object({ type: v.literal("discard"), resources: resourceBundleValidator }),
  v.object({
    type: v.literal("move-robber"),
    hexId: v.string(),
    victimId: v.union(v.string(), v.null()),
  }),
  v.object({ type: v.literal("choose-robber-victim"), victimId: v.string() }),
  v.object({ type: v.literal("build-road"), edgeId: v.string() }),
  v.object({ type: v.literal("build-settlement"), vertexId: v.string() }),
  v.object({ type: v.literal("build-city"), vertexId: v.string() }),
  v.object({ type: v.literal("buy-development-card") }),
  v.object({ type: v.literal("play-knight"), cardId: v.string() }),
  v.object({ type: v.literal("play-monopoly"), cardId: v.string(), resource: resourceValidator }),
  v.object({
    type: v.literal("play-year-of-plenty"),
    cardId: v.string(),
    resources: v.array(resourceValidator),
  }),
  v.object({
    type: v.literal("play-road-building"),
    cardId: v.string(),
    edgeIds: v.array(v.string()),
  }),
  v.object({
    type: v.literal("make-offer"),
    give: resourceBundleValidator,
    want: resourceBundleValidator,
  }),
  v.object({
    type: v.literal("counter-offer"),
    give: resourceBundleValidator,
    want: resourceBundleValidator,
  }),
  v.object({ type: v.literal("accept-offer") }),
  v.object({ type: v.literal("reject-offer") }),
  v.object({ type: v.literal("confirm-offer"), partnerId: v.string() }),
  v.object({ type: v.literal("cancel-offer") }),
  v.object({
    type: v.literal("maritime-trade"),
    giveResource: resourceValidator,
    giveAmount: v.number(),
    receiveResource: resourceValidator,
  }),
  v.object({ type: v.literal("end-turn") }),
);
