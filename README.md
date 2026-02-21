# EchoVault

A personal memory engine that captures, stores, and retrieves your thoughts using voice or text. Powered by AI for intelligent extraction and semantic search.

## Features

- **Voice Recording**: Speak your thoughts and have them automatically transcribed
- **Text Input**: Type memories directly when voice isn't convenient
- **AI Extraction**: Claude automatically extracts people, tasks, topics, and decisions from your memories
- **Semantic Search**: Ask natural language questions about your memories
- **Real-time Sync**: Memories appear instantly across all connected clients
- **MCP Integration**: Access your memories from Claude Desktop or Claude Code

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                         │
│  VoiceRecorder → Record voice or type text          │
│  SearchChat    → Ask questions about memories       │
│  MemoryList    → View all stored memories           │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                 CONVEX BACKEND                      │
│  • Stores memories with vector embeddings           │
│  • Claude extracts: people, tasks, topics, decisions│
│  • Vector search finds relevant memories            │
│  • Claude synthesizes answers from memories         │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                 EXTERNAL APIs                       │
│  smallest.ai  → Voice transcription                 │
│  Claude API   → Extraction + answer synthesis       │
│  OpenAI API   → Embeddings for semantic search      │
└─────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- API keys for:
  - [Anthropic](https://console.anthropic.com/) (Claude)
  - [OpenAI](https://platform.openai.com/) (embeddings)
  - [Smallest.ai](https://smallest.ai/) (voice transcription - optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/echovault.git
   cd echovault
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd mcp-server && npm install && cd ..
   ```

3. **Set up Convex**
   ```bash
   npx convex dev
   ```
   This will prompt you to create a Convex account and project.

4. **Configure environment variables**

   Create `.env.local`:
   ```bash
   CONVEX_DEPLOYMENT=dev:your-project-name
   NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
   NEXT_PUBLIC_CONVEX_SITE_URL=https://your-project.convex.site
   SMALLEST_API_KEY=your_smallest_api_key  # Optional, for voice
   ```

   In Convex Dashboard → Settings → Environment Variables:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   OPENAI_API_KEY=sk-...
   ```

5. **Start the development server**
   ```bash
   # Terminal 1: Convex backend
   npx convex dev

   # Terminal 2: Next.js frontend
   npm run dev
   ```

6. **Open http://localhost:3000**

## Usage

### Adding Memories

- **Voice**: Click the microphone button, speak, then click stop
- **Text**: Type in the text field and click "Add"

### Searching Memories

Type natural language questions like:
- "What tasks do I have?"
- "What did I discuss with John?"
- "What decisions have I made about the product?"

### MCP Integration (Claude Desktop)

1. Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "echovault": {
         "command": "npx",
         "args": ["tsx", "/path/to/echovault/mcp-server/index.ts"],
         "env": {
           "CONVEX_URL": "https://your-project.convex.site"
         }
       }
     }
   }
   ```

2. Restart Claude Desktop

3. Use tools like:
   - "Add a memory: I need to buy groceries tomorrow"
   - "What memories do I have?"
   - "What are my tasks?"

## Python Agent Worker

You can run a long-lived Python worker that polls Convex for new `memories` entries and runs custom actions.

Built-in custom action:
- If a memory looks like a meeting, generate an `.ics` invite file and provide a Google Calendar import link.
- If a memory contains a goal, generate personalized coaching suggestions.

### 1. Start your Convex backend

```bash
npx convex dev
```

### 2. Run the worker

```bash
python3 scripts/convex_agent.py --base-url https://your-project.convex.site
```

You can also set:

```bash
export CONVEX_SITE_URL=https://your-project.convex.site
export AGENT_POLL_INTERVAL=3
export OPENAI_API_KEY=sk-...
python3 scripts/convex_agent.py
```

### 3. Add a memory that should trigger an action

Use the normal add-memory endpoint:

```bash
curl -X POST "$CONVEX_SITE_URL/add-memory" \
  -H "Content-Type: application/json" \
  -d '{"text":"Meeting with Priya on 2026-02-23 14:30 about Q2 planning","source":"text"}'
```

Agent polling endpoint:
- `POST /memories/since` with `{ "since": <timestamp_ms>, "limit": 100 }`

Date parsing rules for meeting events:
- `YYYY-MM-DD HH:MM`
- `YYYY-MM-DDTHH:MM`
- `YYYY-MM-DD` (defaults to `09:00` local)
- Creates `.ics` files in `scripts/generated_invites` (or `AGENT_ICS_DIR`)
- Returns Google Calendar import page link: `https://calendar.google.com/calendar/u/0/r/settings/export`

Goal suggestion behavior:
- Detects goal-like language (`goal`, `get better`, `improve`, `practice`, etc.)
- Generates structured suggestions (`goal`, `suggestions`, `weekly_plan`, `first_step`)
- Uses OpenAI when `OPENAI_API_KEY` is set, otherwise uses a local fallback plan
- Every executed action is stored in Convex `agentActions` and shown in the dashboard

## Project Structure

```
echovault/
├── app/                    # Next.js app router
│   ├── api/transcribe/     # Voice transcription endpoint
│   ├── ConvexProvider.tsx  # Convex client provider
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main page
├── components/
│   ├── VoiceRecorder.tsx   # Voice/text input component
│   ├── MemoryList.tsx      # Display memories
│   └── SearchChat.tsx      # Search interface
├── convex/
│   ├── schema.ts           # Database schema
│   ├── memories.ts         # Memory CRUD + AI extraction
│   ├── search.ts           # Vector search + AI synthesis
│   └── http.ts             # HTTP endpoints for MCP
├── mcp-server/
│   ├── index.ts            # MCP server implementation
│   └── package.json        # MCP dependencies
└── lib/
    ├── claude.ts           # Claude API helpers
    └── smallest.ts         # Transcription helpers
```

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Backend**: Convex (real-time database + serverless functions)
- **AI**: Claude (extraction/synthesis), OpenAI (embeddings)
- **Voice**: Smallest.ai Pulse API
- **MCP**: Model Context Protocol for Claude integration

## License

MIT
