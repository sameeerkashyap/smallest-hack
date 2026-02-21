# Nura

Nura is an agentic memory layer acting as your second brain.

It captures conversations, stores structured memory in Convex, and runs background agents that execute actions from new context.

## What Nura Does

- Captures voice and text memories
- Extracts structure (`summary`, `people`, `tasks`, `topics`, `decisions`)
- Supports semantic memory search and chat over context
- Runs a long-lived Python agent on new memories
- Persists executed agent actions to Convex for UI visibility

## Agentic Second-Brain Loop

1. A memory is added from UI, MCP, or HTTP.
2. Convex stores structured memory + embedding.
3. Agent polls `POST /memories/since` for new entries.
4. Agent runs custom actions based on memory intent.
5. Action results are written to `agentActions`.
6. Dashboard renders live agent activity.

## Built-in Agent Actions

### `meeting_to_google_calendar`
- Detects meeting intent (`meeting`, `call`, `sync`, `standup`, `interview`).
- Parses date/time from memory text:
  - `YYYY-MM-DD HH:MM`
  - `YYYY-MM-DDTHH:MM`
  - `YYYY-MM-DD` (defaults to 09:00 local)
- Generates `.ics` invite files in `scripts/generated_invites` (or `AGENT_ICS_DIR`).
- Opens Google Calendar create page with prefilled fields:
  - `https://calendar.google.com/calendar/u/0/r/settings/createcalendar`
  - includes `name` and `description` query params.

### `goal_coaching_suggestions`
- Detects goal language (`goal`, `get better`, `improve`, `practice`, `learn`, etc.).
- Produces structured suggestions:
  - `goal`
  - `suggestions[]`
  - `weekly_plan[]`
  - `first_step`
- Uses OpenAI when configured, otherwise fallback heuristic planner.

## System Architecture

- `Next.js` app: second-brain dashboard UI
- `Convex`: memory store, vector search, HTTP routes, action logs
- `Python agent`: continuous custom action execution

Core tables:
- `memories`
- `agentActions`

## Local Setup

### 1) Install dependencies

```bash
npm install
cd mcp-server && npm install && cd ..
```

### 2) Configure `.env.local`

```bash
CONVEX_DEPLOYMENT=anonymous:anonymous-echovault
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211

SMALLEST_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

### 3) Run Nura (3 terminals)

Terminal A (Convex local backend):
```bash
npx convex dev
```

Terminal B (web app):
```bash
npm run dev
```

Terminal C (agent):
```bash
python3 scripts/convex_agent.py --base-url http://127.0.0.1:3211
```

## Agent Runtime Config

Optional environment variables:

```bash
export CONVEX_SITE_URL=http://127.0.0.1:3211
export AGENT_POLL_INTERVAL=3
export AGENT_REQUEST_TIMEOUT=30
export AGENT_STATE_FILE=scripts/.convex_agent_state.json
export AGENT_ICS_DIR=scripts/generated_invites
export AGENT_OPEN_BROWSER=true
export OPENAI_API_KEY=sk-...
```

## Convex HTTP Endpoints Used

- `POST /add-memory`
- `POST /search`
- `GET /memories`
- `POST /memories/since`
- `POST /agent-actions/log`
- `GET /agent-actions`

## UI Layout

Nura dashboard sections:
- Left: live transcription
- Right top: memories + chat
- Right bottom: executed agent actions

`Agent Actions` panel reads `/api/agent-actions`, which proxies Convex `/agent-actions`.

## Troubleshooting

### Agent Actions panel shows `Failed with status 500`
- Ensure Convex local backend is running:
  - `npx convex dev`
- Verify endpoint health:
  - `http://127.0.0.1:3211/agent-actions?limit=5`

### Agent still shows old behavior
An old Python process is usually running. Restart agent:

```bash
pkill -f "convex_agent.py" || true
python3 scripts/convex_agent.py --base-url http://127.0.0.1:3211
```

### Browser does not open for calendar flow
- Ensure `AGENT_OPEN_BROWSER` is not `false`.
- Ensure OS allows Python to open browser windows.

## Important Paths

- `/Users/sameerkashyap/code/echovault/app/page.tsx`
- `/Users/sameerkashyap/code/echovault/app/layout.tsx`
- `/Users/sameerkashyap/code/echovault/convex/schema.ts`
- `/Users/sameerkashyap/code/echovault/convex/http.ts`
- `/Users/sameerkashyap/code/echovault/convex/agentActions.ts`
- `/Users/sameerkashyap/code/echovault/scripts/convex_agent.py`
