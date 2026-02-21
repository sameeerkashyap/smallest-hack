"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface MemoryListProps {
  limit?: number;
  showHeader?: boolean;
  compact?: boolean;
}

export default function MemoryList({
  limit = 8,
  showHeader = true,
  compact = false,
}: MemoryListProps) {
  const memories = useQuery(api.memories.list);

  console.log("[MemoryList] Memories query state:", {
    isLoading: memories === undefined,
    count: memories?.length ?? 0,
  });

  if (memories === undefined) {
    console.log("[MemoryList] Loading memories...");
    return (
      <div className={showHeader ? "rounded-2xl border border-white/15 bg-slate-900/45 p-4" : "p-1"}>
        {showHeader && <h2 className="mb-3 text-lg font-semibold text-white">Recent Memories</h2>}
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-indigo-200/10" />
          ))}
        </div>
      </div>
    );
  }

  if (memories.length === 0) {
    console.log("[MemoryList] No memories found");
    return (
      <div className={showHeader ? "rounded-2xl border border-white/15 bg-slate-900/45 p-4" : "p-1"}>
        {showHeader && <h2 className="mb-3 text-lg font-semibold text-white">Recent Memories</h2>}
        <p className="py-8 text-center text-sm text-indigo-100/70">
          No memories yet. Add one above!
        </p>
      </div>
    );
  }

  console.log("[MemoryList] Rendering", memories.length, "memories");

  return (
    <div className={showHeader ? "rounded-2xl border border-white/15 bg-slate-900/45 p-4" : "p-1"}>
      {showHeader && <h2 className="mb-3 text-lg font-semibold text-white">Recent Memories</h2>}
      <div className={`${compact ? "space-y-2" : "max-h-[28vh] space-y-3 overflow-y-auto pr-1"}`}>
        {memories.slice(0, limit).map((memory) => (
          <div
            key={memory._id}
            className="rounded-xl border border-white/15 bg-slate-950/55 p-3 transition-colors hover:border-indigo-300/50"
          >
            <div className="flex items-start justify-between mb-2">
              <p className="font-medium text-indigo-50">{memory.summary}</p>
              <span className="ml-2 whitespace-nowrap text-xs text-indigo-100/45">
                {new Date(memory.createdAt).toLocaleTimeString()}
              </span>
            </div>

            <p className="mb-3 line-clamp-2 text-sm text-indigo-100/75">
              {memory.rawText}
            </p>

            <div className="flex flex-wrap gap-2">
              {memory.people.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {memory.people.map((person, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-indigo-300/25 px-2 py-0.5 text-xs text-indigo-100"
                    >
                      {person}
                    </span>
                  ))}
                </div>
              )}

              {memory.tasks.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {memory.tasks.map((task, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-amber-300/20 px-2 py-0.5 text-xs text-amber-100"
                    >
                      {task}
                    </span>
                  ))}
                </div>
              )}

              {memory.topics.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {memory.topics.map((topic, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-emerald-300/20 px-2 py-0.5 text-xs text-emerald-100"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              {memory.decisions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {memory.decisions.map((decision, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-fuchsia-300/20 px-2 py-0.5 text-xs text-fuchsia-100"
                    >
                      {decision}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-2 flex items-center text-xs text-indigo-100/60">
              <span
                className={`rounded px-1.5 py-0.5 ${
                  memory.source === "voice"
                    ? "bg-rose-300/20 text-rose-100"
                    : memory.source === "mcp"
                    ? "bg-indigo-300/20 text-indigo-100"
                    : "bg-slate-300/20 text-slate-100"
                }`}
              >
                {memory.source}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
