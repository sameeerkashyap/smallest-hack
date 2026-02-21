"use client";

import { useEffect, useState } from "react";

type AgentAction = {
  _id: string;
  actionType: string;
  status: "success" | "failed" | "skipped";
  memorySummary?: string;
  details?: unknown;
  createdAt: number;
};

export default function AgentActionsList() {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchActions = async () => {
      try {
        const response = await fetch("/api/agent-actions?limit=30");
        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }
        const data = await response.json();
        if (!mounted) return;
        setActions(Array.isArray(data.actions) ? data.actions : []);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load actions");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchActions();
    const interval = setInterval(fetchActions, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (isLoading) {
    return <p className="text-sm text-indigo-100/70">Loading recent agent actions...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>;
  }

  if (actions.length === 0) {
    return (
      <p className="text-sm text-indigo-100/70">
        No agent actions yet. Start the Python agent to see executions.
      </p>
    );
  }

  return (
    <div className="space-y-3 max-h-[32vh] overflow-y-auto pr-1">
      {actions.map((action) => (
        <div
          key={action._id}
          className="rounded-xl border border-white/15 bg-slate-900/45 px-4 py-3 shadow-[0_0_35px_rgba(99,102,241,0.22)]"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">{action.actionType}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                action.status === "success"
                  ? "bg-emerald-400/25 text-emerald-200"
                  : action.status === "failed"
                  ? "bg-rose-400/25 text-rose-200"
                  : "bg-amber-300/20 text-amber-100"
              }`}
            >
              {action.status}
            </span>
          </div>
          {action.memorySummary && (
            <p className="line-clamp-1 text-xs text-indigo-100/75">{action.memorySummary}</p>
          )}
          <p className="mt-1 text-[11px] text-indigo-100/55">
            {new Date(action.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
