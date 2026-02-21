"use client";

import { useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import MemoryList from "@/components/MemoryList";
import SearchChat from "@/components/SearchChat";
import AgentActionsList from "@/components/AgentActionsList";

export default function Home() {
  const [liveTranscript, setLiveTranscript] = useState("");
  const [recorderStatus, setRecorderStatus] = useState<"idle" | "recording" | "processing">("idle");

  return (
    <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_-20%,#1e1b4b_0%,#07090f_52%,#05070d_100%)] px-3 py-3 text-white md:px-4">
      <div className="mx-auto flex h-full w-full max-w-[1800px] flex-col gap-3">
        <header className="flex items-center justify-between px-1">
          <h1 className="text-2xl font-semibold tracking-tight text-white">AI Second Brain</h1>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-300">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            System Online
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <section className="flex min-h-0 w-full flex-col rounded-[24px] border border-white/10 bg-white/[0.02] shadow-[0_0_80px_rgba(99,102,241,0.2)] lg:w-1/2">
            <div className="rounded-t-[24px] border-b border-white/10 bg-white/[0.015] px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-zinc-100">Live Transcription</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                    recorderStatus === "recording"
                      ? "bg-rose-500/20 text-rose-200"
                      : recorderStatus === "processing"
                      ? "bg-amber-400/20 text-amber-100"
                      : "bg-zinc-500/20 text-zinc-200"
                  }`}
                >
                  {recorderStatus}
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <p className="text-lg leading-relaxed text-zinc-300">
                {liveTranscript || "Awaiting voice input..."}
              </p>
            </div>
          </section>

          <section className="flex min-h-0 w-full flex-col gap-3 lg:w-1/2">
            <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-white/10 bg-white/[0.02] p-4 shadow-[0_0_80px_rgba(129,140,248,0.2)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-400/35 bg-indigo-500/15 text-sm font-bold text-indigo-300">
                    M
                  </div>
                  <p className="text-lg font-semibold text-zinc-100">Memories + Chat</p>
                </div>
                <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase text-zinc-300">
                  idle
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                <SearchChat showHeader={false} />
                <MemoryList limit={6} showHeader={false} compact />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-white/10 bg-white/[0.02] p-4 shadow-[0_0_80px_rgba(16,185,129,0.17)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/35 bg-emerald-500/15 text-sm font-bold text-emerald-300">
                    A
                  </div>
                  <p className="text-lg font-semibold text-zinc-100">Agent Actions</p>
                </div>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold uppercase text-emerald-100">
                  awaiting
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <AgentActionsList />
              </div>
            </div>
          </section>
        </main>

        <footer className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,13,24,.75),rgba(7,9,15,.95))] px-4 py-3 shadow-[0_0_90px_rgba(99,102,241,0.15)]">
          <VoiceRecorder
            mode="dock"
            onLiveTranscriptChange={setLiveTranscript}
            onStatusChange={setRecorderStatus}
          />
        </footer>
      </div>
    </div>
  );
}
