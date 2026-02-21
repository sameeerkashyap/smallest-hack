"use client";

import { useState, useRef, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

type RecorderStatus = "idle" | "recording" | "processing";

interface VoiceRecorderProps {
  onLiveTranscriptChange?: (text: string) => void;
  onStatusChange?: (status: RecorderStatus) => void;
  mode?: "panel" | "dock";
}

type SpeechRecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function VoiceRecorder({
  onLiveTranscriptChange,
  onStatusChange,
  mode = "panel",
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(null);
  const finalTranscriptRef = useRef("");

  const addMemory = useAction(api.memories.addMemory);

  const updateTranscript = useCallback(
    (nextText: string) => {
      setLiveTranscript(nextText);
      onLiveTranscriptChange?.(nextText);
    },
    [onLiveTranscriptChange]
  );

  const startSpeechRecognition = useCallback(() => {
    const win = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      updateTranscript("Live transcription unavailable in this browser.");
      return;
    }

    finalTranscriptRef.current = "";
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalTranscriptRef.current += `${text} `;
        } else {
          interim += text;
        }
      }
      updateTranscript(`${finalTranscriptRef.current}${interim}`.trim());
    };

    recognition.onerror = (event) => {
      console.warn("[VoiceRecorder] Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      if (mediaRecorderRef.current?.state === "recording") {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [updateTranscript]);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  const processAudio = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);
      onStatusChange?.("processing");

      try {
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Transcription failed");
        }

        const { text } = await response.json();
        if (text && text.trim()) {
          updateTranscript(text);
          await addMemory({ rawText: text, source: "voice" });
        }
      } catch (error) {
        console.error("[VoiceRecorder] Failed to process audio:", error);
        alert("Failed to process audio. Please try again.");
      } finally {
        setIsProcessing(false);
        onStatusChange?.("idle");
      }
    },
    [addMemory, onStatusChange, updateTranscript]
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      chunksRef.current = [];
      updateTranscript("");

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      startSpeechRecognition();
      setIsRecording(true);
      onStatusChange?.("recording");
    } catch (error) {
      console.error("[VoiceRecorder] Failed to start recording:", error);
      alert("Could not access microphone. Please grant permission.");
    }
  }, [onStatusChange, processAudio, startSpeechRecognition, updateTranscript]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      stopSpeechRecognition();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording, stopSpeechRecognition]);

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    setIsProcessing(true);
    onStatusChange?.("processing");

    try {
      await addMemory({ rawText: textInput, source: "text" });
      setTextInput("");
    } catch (error) {
      console.error("[VoiceRecorder] Failed to add memory:", error);
      alert("Failed to add memory. Please try again.");
    } finally {
      setIsProcessing(false);
      onStatusChange?.("idle");
    }
  };

  if (mode === "dock") {
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/20 text-white shadow-[0_0_45px_rgba(129,140,248,0.45)] transition-all ${
            isRecording
              ? "bg-rose-500/80 hover:bg-rose-500"
              : isProcessing
              ? "cursor-not-allowed bg-slate-500/70"
              : "bg-slate-900/90 hover:bg-indigo-500/40"
          }`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isProcessing ? (
            <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8V0" fill="currentColor" className="opacity-80" />
            </svg>
          ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5a3 3 0 10-6 0v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11a5 5 0 11-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z" />
            </svg>
          )}
        </button>
        <p className="text-center text-sm tracking-[0.2em] text-blue-400">
          {isRecording ? "LISTENING..." : isProcessing ? "PROCESSING..." : "CLICK TO START SPEAKING"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={`h-20 w-20 rounded-full border border-white/20 shadow-[0_0_55px_rgba(129,140,248,0.5)] transition-all ${
            isRecording
              ? "bg-rose-500/80 hover:bg-rose-500"
              : isProcessing
              ? "cursor-not-allowed bg-slate-500/70"
              : "bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500"
          }`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          <span className="sr-only">Record</span>
        </button>

        <div>
          <p className="text-sm font-semibold text-white">
            {isRecording
              ? "Listening now"
              : isProcessing
              ? "Processing memory"
              : "Tap to start recording"}
          </p>
          <p className="text-xs text-indigo-100/70">Voice or text memory capture</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/15 bg-slate-950/55 p-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-indigo-200/70">Live Transcript</p>
        <p className="min-h-16 text-sm leading-6 text-indigo-50/90">
          {liveTranscript || "Start speaking to see live transcript here..."}
        </p>
      </div>

      <form onSubmit={handleTextSubmit} className="flex gap-2">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Type a memory..."
          className="flex-1 rounded-xl border border-white/20 bg-slate-950/55 px-3 py-2 text-sm text-white placeholder:text-indigo-100/45 focus:border-indigo-300 focus:outline-none"
          disabled={isProcessing}
        />
        <button
          type="submit"
          disabled={isProcessing || !textInput.trim()}
          className="rounded-xl bg-indigo-500/90 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_30px_rgba(99,102,241,0.6)] hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          Add
        </button>
      </form>
    </div>
  );
}
