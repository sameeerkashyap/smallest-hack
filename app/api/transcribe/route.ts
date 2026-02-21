import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  console.log("[API/transcribe] Received transcription request");

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob;

    if (!file) {
      console.error("[API/transcribe] No audio file in request");
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    console.log("[API/transcribe] Audio file received, size:", file.size, "type:", file.type);

    const apiKey = process.env.SMALLEST_API_KEY;
    console.log("[API/transcribe] API key present:", !!apiKey, "length:", apiKey?.length ?? 0);

    if (!apiKey) {
      console.error("[API/transcribe] SMALLEST_API_KEY not set in .env.local");
      return NextResponse.json(
        { error: "Transcription service not configured" },
        { status: 500 }
      );
    }

    // Convert Blob to ArrayBuffer for raw audio upload
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    console.log("[API/transcribe] Calling smallest.ai Pulse API...");

    // Use the correct Waves API endpoint with raw audio bytes
    // Docs: https://waves-docs.smallest.ai/v4.0.0/content/speech-to-text/pre-recorded/quickstart
    const response = await fetch(
      "https://waves-api.smallest.ai/api/v1/pulse/get_text?model=pulse&language=en",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "audio/webm",
        },
        body: audioBuffer,
      }
    );

    console.log("[API/transcribe] smallest.ai response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[API/transcribe] Transcription API error:", errorText);
      return NextResponse.json(
        { error: "Transcription failed", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("[API/transcribe] Raw response data:", JSON.stringify(data));

    // Handle different response formats from smallest.ai
    const text = data.text || data.transcript || data.transcription || "";
    console.log("[API/transcribe] Extracted text:", text);

    return NextResponse.json({ text });
  } catch (error) {
    console.error("[API/transcribe] Transcription error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
