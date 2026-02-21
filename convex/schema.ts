import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  memories: defineTable({
    createdAt: v.float64(),
    decisions: v.array(v.string()),
    embedding: v.array(v.float64()),
    people: v.array(v.string()),
    rawText: v.string(),
    source: v.union(
      v.literal("voice"),
      v.literal("text"),
      v.literal("mcp")
    ),
    summary: v.string(),
    tasks: v.array(v.string()),
    topics: v.array(v.string()),
  })
    .index("by_created", ["createdAt"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
    }),
  agentActions: defineTable({
    actionType: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    memoryId: v.optional(v.string()),
    memorySummary: v.optional(v.string()),
    details: v.optional(v.any()),
    createdAt: v.float64(),
  }).index("by_created", ["createdAt"]),
});
