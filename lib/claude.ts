// Claude API helper for server-side operations

export interface ExtractionResult {
  summary: string;
  people: string[];
  tasks: string[];
  topics: string[];
  decisions: string[];
}

export async function extractFromMemory(
  text: string
): Promise<ExtractionResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Extract structured information from this memory/note. Return ONLY valid JSON.

Memory: "${text}"

Return JSON with:
- summary: Brief 1-2 sentence summary
- people: Array of people mentioned
- tasks: Array of action items
- topics: Array of main topics
- decisions: Array of decisions made`,
        },
      ],
    }),
  });

  const data = await response.json();
  const content = data.content[0].text;

  try {
    return JSON.parse(content);
  } catch {
    return {
      summary: text.slice(0, 100),
      people: [],
      tasks: [],
      topics: [],
      decisions: [],
    };
  }
}

export async function chatWithMemories(
  query: string,
  memories: any[]
): Promise<string> {
  const context = memories
    .map(
      (m) => `- ${m.summary} (Topics: ${m.topics?.join(", ")})`
    )
    .join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Based on these memories:\n${context}\n\nAnswer: ${query}`,
        },
      ],
    }),
  });

  const data = await response.json();
  return data.content[0].text;
}
