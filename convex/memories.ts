import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

// Store a new memory (called after extraction)
export const store = mutation({
  args: {
    rawText: v.string(),
    source: v.union(v.literal("voice"), v.literal("text"), v.literal("mcp")),
    summary: v.string(),
    people: v.array(v.string()),
    tasks: v.array(v.string()),
    topics: v.array(v.string()),
    decisions: v.array(v.string()),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    console.log("[memories.store] Storing new memory:", {
      source: args.source,
      summary: args.summary,
      people: args.people,
      tasks: args.tasks,
      topics: args.topics,
      embeddingLength: args.embedding.length,
    });

    const memoryId = await ctx.db.insert("memories", {
      ...args,
      createdAt: Date.now(),
    });

    console.log("[memories.store] Memory stored with ID:", memoryId);
    return memoryId;
  },
});

// Get all memories (most recent first)
export const list = query({
  args: {},
  handler: async (ctx) => {
    console.log("[memories.list] Fetching memories...");
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_created")
      .order("desc")
      .take(50);
    console.log("[memories.list] Found", memories.length, "memories");
    return memories;
  },
});

// Get memories created after a timestamp (ascending by creation)
export const listSince = query({
  args: {
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("memories")
      .withIndex("by_created")
      .order("asc")
      .collect();

    const filtered = all.filter((memory) => memory.createdAt > args.since);
    const limit = args.limit ?? 50;
    return filtered.slice(0, limit);
  },
});

// Get all tasks from all memories
export const getAllTasks = query({
  args: {},
  handler: async (ctx) => {
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_created")
      .order("desc")
      .collect();

    const tasks: { task: string; source: string; createdAt: number }[] = [];
    for (const memory of memories) {
      for (const task of memory.tasks) {
        tasks.push({
          task,
          source: memory.summary,
          createdAt: memory.createdAt,
        });
      }
    }
    return tasks;
  },
});

// Add memory action (handles extraction + embedding + storage)
export const addMemory = action({
  args: {
    rawText: v.string(),
    source: v.union(v.literal("voice"), v.literal("text"), v.literal("mcp")),
  },
  handler: async (ctx, args) => {
    console.log("[memories.addMemory] Starting memory addition:", {
      source: args.source,
      textLength: args.rawText.length,
      textPreview: args.rawText.slice(0, 100),
    });

    // Call Claude for extraction
    console.log("[memories.addMemory] Extracting with Claude...");
    const extraction = await extractWithClaude(args.rawText);
    console.log("[memories.addMemory] Extraction result:", extraction);

    // Generate embedding
    console.log("[memories.addMemory] Generating embedding...");
    const embedding = await generateEmbedding(args.rawText);
    console.log("[memories.addMemory] Embedding generated, length:", embedding.length);

    // Store the memory
    console.log("[memories.addMemory] Storing memory...");
    const memoryId = await ctx.runMutation(api.memories.store, {
      rawText: args.rawText,
      source: args.source,
      summary: extraction.summary,
      people: extraction.people,
      tasks: extraction.tasks,
      topics: extraction.topics,
      decisions: extraction.decisions,
      embedding,
    });

    console.log("[memories.addMemory] Memory added successfully:", memoryId);
    return memoryId;
  },
});

// Helper: Extract structured data with Claude
async function extractWithClaude(text: string): Promise<{
  summary: string;
  people: string[];
  tasks: string[];
  topics: string[];
  decisions: string[];
}> {
  console.log("[extractWithClaude] Starting extraction for text:", text.slice(0, 100));

  const rawApiKey = process.env.ANTHROPIC_API_KEY;
  // Clean the API key: trim, remove quotes, remove newlines and carriage returns
  const apiKey = rawApiKey
    ?.trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n]/g, '');

  console.log("[extractWithClaude] API key debug:", {
    present: !!apiKey,
    length: apiKey?.length,
    prefix: apiKey?.slice(0, 7), // Should be "sk-ant-"
    hasWhitespace: rawApiKey !== apiKey,
  });

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set in Convex dashboard");
  }

  if (!apiKey.startsWith("sk-ant-")) {
    console.error("[extractWithClaude] API key does not start with 'sk-ant-'. Got prefix:", apiKey.slice(0, 10));
    throw new Error("ANTHROPIC_API_KEY appears to be invalid. It should start with 'sk-ant-'");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Extract structured information from this memory/note. Return ONLY valid JSON with no markdown formatting.

Memory: "${text}"

Return JSON with these fields:
- summary: A brief 1-2 sentence summary
- people: Array of people mentioned (names only)
- tasks: Array of action items or tasks (as clear actionable statements)
- topics: Array of main topics/themes
- decisions: Array of any decisions made or conclusions reached

Example response:
{"summary":"Meeting about product launch","people":["John","Sarah"],"tasks":["Send proposal by Friday","Review designs"],"topics":["product launch","marketing"],"decisions":["Launch date set for March 15"]}`,
        },
      ],
    }),
  });

  console.log("[extractWithClaude] Claude response status:", response.status);

  const data = await response.json();
  console.log("[extractWithClaude] Claude response data:", JSON.stringify(data).slice(0, 500));

  if (!response.ok) {
    console.error("[extractWithClaude] Claude API error:", data);
    throw new Error(`Claude API error: ${data.error?.message || "Unknown error"}`);
  }

  const content = data.content[0].text;
  console.log("[extractWithClaude] Raw content:", content);

  try {
    const parsed = JSON.parse(content);
    console.log("[extractWithClaude] Parsed successfully:", parsed);
    return parsed;
  } catch (parseError) {
    console.error("[extractWithClaude] JSON parse failed:", parseError);
    console.log("[extractWithClaude] Using fallback extraction");
    // Fallback if parsing fails
    return {
      summary: text.slice(0, 100),
      people: [],
      tasks: [],
      topics: [],
      decisions: [],
    };
  }
}

// Helper: Generate embedding with OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  console.log("[generateEmbedding] Generating embedding for text length:", text.length);

  const rawApiKey = process.env.OPENAI_API_KEY;
  // Clean the API key: trim, remove quotes, remove newlines and carriage returns
  const apiKey = rawApiKey
    ?.trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n]/g, '');

  console.log("[generateEmbedding] OpenAI API key debug:", {
    present: !!apiKey,
    length: apiKey?.length,
    prefix: apiKey?.slice(0, 7),
    rawLength: rawApiKey?.length,
    hadNewlines: rawApiKey?.includes('\n') || rawApiKey?.includes('\r'),
  });

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set in Convex dashboard");
  }

  if (!apiKey.startsWith("sk-")) {
    console.error("[generateEmbedding] OpenAI API key should start with 'sk-'. Got:", apiKey.slice(0, 10));
    throw new Error("OPENAI_API_KEY appears invalid. Should start with 'sk-'");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  console.log("[generateEmbedding] OpenAI response status:", response.status);

  const data = await response.json();

  if (!response.ok) {
    console.error("[generateEmbedding] OpenAI API error:", data);
    throw new Error(`OpenAI API error: ${data.error?.message || "Unknown error"}`);
  }

  const embedding = data.data[0].embedding;
  console.log("[generateEmbedding] Embedding generated, dimensions:", embedding.length);

  return embedding;
}
