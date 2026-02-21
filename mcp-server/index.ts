#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Get Convex URL from environment
const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
  console.error("Error: CONVEX_URL environment variable is required");
  process.exit(1);
}

// Convert Convex URL to HTTP endpoint URL
// For cloud: https://xxx.convex.cloud -> https://xxx.convex.site
// For local dev: http://127.0.0.1:3210 stays the same
let HTTP_URL: string;
if (CONVEX_URL.includes("convex.cloud")) {
  HTTP_URL = CONVEX_URL.replace(".convex.cloud", ".convex.site");
} else {
  // Local development - use the same URL
  HTTP_URL = CONVEX_URL;
}

console.error(`[MCP] Using Convex URL: ${CONVEX_URL}`);
console.error(`[MCP] HTTP endpoint URL: ${HTTP_URL}`);

const server = new Server(
  {
    name: "voice-memory",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add_memory",
        description:
          "Add a new memory to the personal memory store. Use this to save thoughts, meeting notes, decisions, tasks, or any information the user wants to remember.",
        inputSchema: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description:
                "The memory content to store. Can be a thought, note, meeting summary, task, decision, etc.",
            },
          },
          required: ["text"],
        },
      },
      {
        name: "search_memories",
        description:
          "Search through stored memories using natural language. Returns relevant memories and an AI-synthesized answer based on the query.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Natural language query to search memories. Examples: 'What tasks do I have?', 'What did I discuss with John?', 'What decisions have I made about the product?'",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_tasks",
        description:
          "Get all tasks extracted from memories. Returns a list of action items and todos that have been identified from stored memories.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_memories",
        description:
          "List all stored memories. Returns the most recent memories with their summaries, people mentioned, tasks, topics, and decisions.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[MCP] Tool called: ${name}`);
  console.error(`[MCP] Arguments:`, JSON.stringify(args));

  try {
    switch (name) {
      case "add_memory": {
        const { text } = args as { text: string };

        console.error(`[MCP/add_memory] Adding memory, text length: ${text.length}`);
        console.error(`[MCP/add_memory] Calling ${HTTP_URL}/add-memory`);

        const response = await fetch(`${HTTP_URL}/add-memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, source: "mcp" }),
        });

        console.error(`[MCP/add_memory] Response status: ${response.status}`);
        const result = await response.json();
        console.error(`[MCP/add_memory] Response:`, JSON.stringify(result));

        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to add memory: ${result.error || "Unknown error"}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Memory added successfully. Memory ID: ${result.memoryId}`,
            },
          ],
        };
      }

      case "search_memories": {
        const { query } = args as { query: string };

        console.error(`[MCP/search_memories] Searching for: ${query}`);
        console.error(`[MCP/search_memories] Calling ${HTTP_URL}/search`);

        let response;
        try {
          response = await fetch(`${HTTP_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          });
        } catch (fetchError) {
          console.error(`[MCP/search_memories] Fetch error:`, fetchError);
          return {
            content: [
              {
                type: "text",
                text: `Connection error: Could not reach Convex. Make sure 'npx convex dev' is running. Error: ${fetchError}`,
              },
            ],
          };
        }

        console.error(`[MCP/search_memories] Response status: ${response.status}`);

        const responseText = await response.text();
        console.error(`[MCP/search_memories] Raw response: ${responseText.slice(0, 500)}`);

        if (!responseText) {
          return {
            content: [
              {
                type: "text",
                text: `Search failed: Empty response from Convex. Make sure 'npx convex dev' is running.`,
              },
            ],
          };
        }

        let result;
        try {
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.error(`[MCP/search_memories] JSON parse error:`, parseError);
          return {
            content: [
              {
                type: "text",
                text: `Search failed: Invalid response from Convex: ${responseText.slice(0, 200)}`,
              },
            ],
          };
        }

        console.error(`[MCP/search_memories] Found ${result.memories?.length || 0} memories`);

        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Search failed: ${result.error || "Unknown error"}`,
              },
            ],
          };
        }

        let output = `Answer: ${result.answer}\n\n`;

        if (result.memories && result.memories.length > 0) {
          output += "Related Memories:\n";
          for (const memory of result.memories) {
            output += `\n- ${memory.summary}`;
            if (memory.people?.length > 0) {
              output += ` (People: ${memory.people.join(", ")})`;
            }
            if (memory.tasks?.length > 0) {
              output += `\n  Tasks: ${memory.tasks.join("; ")}`;
            }
          }
        }

        console.error(`[MCP/search_memories] Returning answer, length: ${output.length}`);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "get_tasks": {
        console.error(`[MCP/get_tasks] Fetching tasks`);
        console.error(`[MCP/get_tasks] Calling ${HTTP_URL}/tasks`);

        const response = await fetch(`${HTTP_URL}/tasks`, {
          method: "GET",
        });

        console.error(`[MCP/get_tasks] Response status: ${response.status}`);
        const result = await response.json();
        console.error(`[MCP/get_tasks] Found ${result.tasks?.length || 0} tasks`);

        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to get tasks: ${result.error || "Unknown error"}`,
              },
            ],
          };
        }

        if (!result.tasks || result.tasks.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No tasks found in your memories.",
              },
            ],
          };
        }

        let output = "Tasks from your memories:\n\n";
        for (const task of result.tasks) {
          const date = new Date(task.createdAt).toLocaleDateString();
          output += `- ${task.task}\n  (From: ${task.source}, Date: ${date})\n\n`;
        }

        console.error(`[MCP/get_tasks] Returning ${result.tasks.length} tasks`);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "list_memories": {
        console.error(`[MCP/list_memories] Listing all memories`);
        console.error(`[MCP/list_memories] Calling ${HTTP_URL}/memories`);

        const response = await fetch(`${HTTP_URL}/memories`, {
          method: "GET",
        });

        console.error(`[MCP/list_memories] Response status: ${response.status}`);
        const result = await response.json();
        console.error(`[MCP/list_memories] Found ${result.memories?.length || 0} memories`);

        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to list memories: ${result.error || "Unknown error"}`,
              },
            ],
          };
        }

        if (!result.memories || result.memories.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No memories stored yet.",
              },
            ],
          };
        }

        let output = `Found ${result.memories.length} memories:\n\n`;
        for (const memory of result.memories) {
          const date = new Date(memory.createdAt).toLocaleDateString();
          output += `## ${memory.summary}\n`;
          output += `Date: ${date} | Source: ${memory.source}\n`;

          if (memory.people?.length > 0) {
            output += `People: ${memory.people.join(", ")}\n`;
          }
          if (memory.tasks?.length > 0) {
            output += `Tasks: ${memory.tasks.join("; ")}\n`;
          }
          if (memory.topics?.length > 0) {
            output += `Topics: ${memory.topics.join(", ")}\n`;
          }
          if (memory.decisions?.length > 0) {
            output += `Decisions: ${memory.decisions.join("; ")}\n`;
          }

          output += `\n---\n\n`;
        }

        console.error(`[MCP/list_memories] Returning ${result.memories.length} memories`);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      default:
        console.error(`[MCP] Unknown tool: ${name}`);
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }
  } catch (error) {
    console.error(`[MCP] Error in tool ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Voice Memory MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
