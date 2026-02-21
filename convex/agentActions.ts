import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const log = mutation({
  args: {
    actionType: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    memoryId: v.optional(v.string()),
    memorySummary: v.optional(v.string()),
    details: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentActions", {
      actionType: args.actionType,
      status: args.status,
      memoryId: args.memoryId,
      memorySummary: args.memorySummary,
      details: args.details ?? {},
      createdAt: Date.now(),
    });
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("agentActions")
      .withIndex("by_created")
      .order("desc")
      .take(limit);
  },
});
