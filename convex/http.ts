import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Add a memory via HTTP (for MCP server)
http.route({
  path: "/add-memory",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    console.log("[http/add-memory] Received request");

    const body = await request.json();
    const { text, source = "mcp" } = body;
    console.log("[http/add-memory] Request body:", { textLength: text?.length, source });

    if (!text) {
      console.error("[http/add-memory] Missing text field");
      return new Response(JSON.stringify({ error: "Missing text field" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      console.log("[http/add-memory] Calling addMemory action...");
      const memoryId = await ctx.runAction(api.memories.addMemory, {
        rawText: text,
        source: source as "voice" | "text" | "mcp",
      });

      console.log("[http/add-memory] Memory added:", memoryId);
      return new Response(
        JSON.stringify({ success: true, memoryId }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("[http/add-memory] Error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to add memory", details: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// Search memories via HTTP (for MCP server)
http.route({
  path: "/search",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    console.log("[http/search] Received search request");

    const body = await request.json();
    const { query } = body;
    console.log("[http/search] Query:", query);

    if (!query) {
      console.error("[http/search] Missing query field");
      return new Response(JSON.stringify({ error: "Missing query field" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      console.log("[http/search] Calling searchMemories action...");
      const result = await ctx.runAction(api.search.searchMemories, { query });
      console.log("[http/search] Search complete, memories found:", result.memories?.length);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[http/search] Error:", error);
      return new Response(
        JSON.stringify({ error: "Search failed", details: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// Get all tasks via HTTP (for MCP server)
http.route({
  path: "/tasks",
  method: "GET",
  handler: httpAction(async (ctx) => {
    console.log("[http/tasks] Received tasks request");

    try {
      console.log("[http/tasks] Fetching all tasks...");
      const tasks = await ctx.runQuery(api.memories.getAllTasks);
      console.log("[http/tasks] Found", tasks.length, "tasks");

      return new Response(JSON.stringify({ tasks }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[http/tasks] Error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to get tasks", details: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// List all memories via HTTP (for MCP server)
http.route({
  path: "/memories",
  method: "GET",
  handler: httpAction(async (ctx) => {
    console.log("[http/memories] Received list memories request");

    try {
      console.log("[http/memories] Fetching all memories...");
      const memories = await ctx.runQuery(api.memories.list);
      console.log("[http/memories] Found", memories.length, "memories");

      return new Response(JSON.stringify({ memories }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[http/memories] Error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to list memories", details: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// List memories created after a timestamp
http.route({
  path: "/memories/since",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json().catch(() => ({}));
    const since = Number(body?.since ?? 0);
    const limit = Number(body?.limit ?? 50);

    if (!Number.isFinite(since) || since < 0) {
      return new Response(JSON.stringify({ error: "Invalid 'since'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const memories = await ctx.runQuery(api.memories.listSince, {
        since,
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50,
      });

      return new Response(JSON.stringify({ memories }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Failed to list new memories", details: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// Log an executed agent action
http.route({
  path: "/agent-actions/log",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json().catch(() => ({}));
    const actionType = body?.actionType;
    const status = body?.status;

    if (!actionType || typeof actionType !== "string") {
      return new Response(JSON.stringify({ error: "Invalid 'actionType'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!["success", "failed", "skipped"].includes(status)) {
      return new Response(JSON.stringify({ error: "Invalid 'status'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const id = await ctx.runMutation(api.agentActions.log, {
      actionType,
      status: status as "success" | "failed" | "skipped",
      memoryId: typeof body?.memoryId === "string" ? body.memoryId : undefined,
      memorySummary:
        typeof body?.memorySummary === "string" ? body.memorySummary : undefined,
      details: body?.details ?? {},
    });

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Get recent executed agent actions
http.route({
  path: "/agent-actions",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

    const actions = await ctx.runQuery(api.agentActions.listRecent, {
      limit,
    });

    return new Response(JSON.stringify({ actions }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
