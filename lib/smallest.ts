// smallest.ai Pulse API wrapper for voice-to-text

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "pulse");

  const response = await fetch("https://api.smallest.ai/v1/transcribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SMALLEST_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Transcription failed: ${error}`);
  }

  const data = await response.json();
  return data.text || data.transcript || "";
}

// Alternative: Use browser's MediaRecorder to capture audio
export function createMediaRecorder(
  stream: MediaStream,
  onDataAvailable: (blob: Blob) => void
): MediaRecorder {
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: "audio/webm;codecs=opus",
  });

  const chunks: Blob[] = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const audioBlob = new Blob(chunks, { type: "audio/webm" });
    onDataAvailable(audioBlob);
  };

  return mediaRecorder;
}
