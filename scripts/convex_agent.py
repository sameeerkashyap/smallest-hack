#!/usr/bin/env python3
"""Long-running Convex memory agent.

Polls new memories and runs custom actions.
Example custom action: meeting memories -> Google Calendar events.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple
from uuid import uuid4

STOP = False


def handle_signal(signum: int, _frame: Any) -> None:
    global STOP
    STOP = True
    print(f"[agent] received signal {signum}, shutting down...")


def post_json(base_url: str, path: str, payload: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {path}: {details}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error for {path}: {exc}") from exc


def load_state(state_file: str) -> Dict[str, Any]:
    if not os.path.exists(state_file):
        return {"last_created_at": None, "processed_ids": []}

    with open(state_file, "r", encoding="utf-8") as f:
        state = json.load(f)

    if "last_created_at" not in state:
        state["last_created_at"] = None
    if "processed_ids" not in state or not isinstance(state["processed_ids"], list):
        state["processed_ids"] = []

    return state


def save_state(state_file: str, state: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(state_file) or ".", exist_ok=True)
    temp = f"{state_file}.tmp"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    os.replace(temp, state_file)


def fetch_new_memories(base_url: str, since: float, timeout: int, limit: int = 100) -> List[Dict[str, Any]]:
    result = post_json(base_url, "/memories/since", {"since": since, "limit": limit}, timeout)
    memories = result.get("memories", [])
    if not isinstance(memories, list):
        raise RuntimeError("Invalid /memories/since response")
    return memories


def log_agent_action(
    base_url: str,
    timeout: int,
    action_type: str,
    status: str,
    memory: Dict[str, Any],
    details: Dict[str, Any],
) -> None:
    payload = {
        "actionType": action_type,
        "status": status,
        "memoryId": memory.get("_id"),
        "memorySummary": memory.get("summary"),
        "details": details,
    }
    try:
        post_json(base_url, "/agent-actions/log", payload, timeout)
    except Exception as exc:  # noqa: BLE001
        print(f"[agent] failed to log action {action_type}: {exc}")


def is_meeting_memory(memory: Dict[str, Any]) -> bool:
    keywords = ("meeting", "call", "sync", "standup", "interview")
    topics = [str(t).lower() for t in memory.get("topics", [])]
    haystack = " ".join(
        [
            str(memory.get("summary", "")).lower(),
            str(memory.get("rawText", "")).lower(),
            " ".join(topics),
        ]
    )
    return any(k in haystack for k in keywords)


def is_goal_memory(memory: Dict[str, Any]) -> bool:
    keywords = (
        "goal",
        "goals",
        "get better",
        "improve",
        "practice",
        "train",
        "learn",
        "want to",
        "plan to",
        "trying to",
    )
    topics = [str(t).lower() for t in memory.get("topics", [])]
    tasks = [str(t).lower() for t in memory.get("tasks", [])]
    haystack = " ".join(
        [
            str(memory.get("summary", "")).lower(),
            str(memory.get("rawText", "")).lower(),
            " ".join(topics),
            " ".join(tasks),
        ]
    )
    return any(k in haystack for k in keywords)


def extract_goal_focus(text: str) -> str:
    # e.g. "get better at golf", "improve my putting"
    patterns = [
        r"get better at ([a-zA-Z0-9 \\-]+)",
        r"improve (?:my|at)?\\s*([a-zA-Z0-9 \\-]+)",
        r"learn ([a-zA-Z0-9 \\-]+)",
        r"practice ([a-zA-Z0-9 \\-]+)",
    ]
    lowered = text.lower()
    for pattern in patterns:
        match = re.search(pattern, lowered)
        if match:
            return match.group(1).strip(" .,!?:;")
    return "your goal"


def call_openai_goal_suggestions(memory: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    raw_text = str(memory.get("rawText", ""))
    summary = str(memory.get("summary", ""))
    tasks = memory.get("tasks", [])
    topics = memory.get("topics", [])
    people = memory.get("people", [])

    prompt = (
        "You are a practical personal coach. Analyze the conversation/memory and if it contains goals, "
        "return a concise, personalized action plan. Output JSON only with this shape: "
        '{"has_goal":true|false,"goal":"...","suggestions":["..."],"weekly_plan":["..."],"first_step":"..."} '
        "Keep suggestions specific, measurable, and realistic. If no goal exists, set has_goal=false and empty arrays."
        f"\\n\\nMemory summary: {summary}"
        f"\\nMemory text: {raw_text}"
        f"\\nKnown tasks: {tasks}"
        f"\\nTopics: {topics}"
        f"\\nPeople: {people}"
    )

    body = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Return strict JSON only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 500,
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    data = json.loads(text)
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)


def fallback_goal_suggestions(memory: Dict[str, Any]) -> Dict[str, Any]:
    raw_text = str(memory.get("rawText", ""))
    goal_focus = extract_goal_focus(raw_text)
    summary = str(memory.get("summary", ""))
    tasks = [str(t) for t in memory.get("tasks", [])]

    suggestions = [
        f"Define a 4-week target for {goal_focus} with a measurable result.",
        f"Schedule 3 focused practice sessions each week for {goal_focus}.",
        "After each session, record one thing that improved and one thing to fix.",
        "Review progress weekly and adjust drills based on your weakest area.",
    ]

    weekly_plan = [
        "Week 1: baseline assessment and technique focus",
        "Week 2: repetition drills and consistency",
        "Week 3: simulate real conditions and track outcomes",
        "Week 4: review metrics and set next target",
    ]

    first_step = f"Block your first 45-minute practice session for {goal_focus} in your calendar today."

    if tasks:
        suggestions.append(f"Tie this plan to existing tasks: {', '.join(tasks[:3])}.")

    return {
        "has_goal": True,
        "goal": goal_focus if goal_focus != "your goal" else summary,
        "suggestions": suggestions,
        "weekly_plan": weekly_plan,
        "first_step": first_step,
        "source": "fallback",
    }


def generate_goal_suggestions(memory: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    try:
        llm_output = call_openai_goal_suggestions(memory, timeout=timeout)
        llm_output["source"] = "openai"
        return llm_output
    except Exception as exc:  # noqa: BLE001
        print(f"[agent] openai goal suggestions unavailable, using fallback: {exc}")
        return fallback_goal_suggestions(memory)


def extract_event_window(memory: Dict[str, Any]) -> Tuple[str, str]:
    """Extract start/end datetimes for the event.

    Supported explicit pattern in text:
    - YYYY-MM-DD HH:MM
    - YYYY-MM-DDTHH:MM
    - YYYY-MM-DD (defaults to 09:00 local)
    """
    text = str(memory.get("rawText", ""))

    match = re.search(r"(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?", text)
    tz = datetime.now().astimezone().tzinfo

    if match:
        date_part = match.group(1)
        time_part = match.group(2) or "09:00"
        start_dt = datetime.fromisoformat(f"{date_part}T{time_part}").replace(tzinfo=tz)
    else:
        created_at_ms = float(memory.get("createdAt", time.time() * 1000.0))
        created_local = datetime.fromtimestamp(created_at_ms / 1000.0, tz=tz)
        # fallback: create event for next day at 09:00 local
        start_dt = (created_local + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)

    end_dt = start_dt + timedelta(minutes=30)
    return start_dt.isoformat(), end_dt.isoformat()


def create_google_calendar_event(memory: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    start, end = extract_event_window(memory)
    summary = str(memory.get("summary", "Meeting")).strip() or "Meeting"
    description = str(memory.get("rawText", ""))
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)
    dtstamp_utc = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    dtstart_utc = start_dt.astimezone().strftime("%Y%m%dT%H%M%SZ")
    dtend_utc = end_dt.astimezone().strftime("%Y%m%dT%H%M%SZ")

    def esc(value: str) -> str:
        return (
            value.replace("\\", "\\\\")
            .replace(";", "\\;")
            .replace(",", "\\,")
            .replace("\n", "\\n")
        )

    uid = f"{uuid4()}@echovault.local"
    ics_content = "\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//EchoVault//Meeting Agent//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{dtstamp_utc}",
            f"DTSTART:{dtstart_utc}",
            f"DTEND:{dtend_utc}",
            f"SUMMARY:{esc(summary)}",
            f"DESCRIPTION:{esc(description)}",
            "END:VEVENT",
            "END:VCALENDAR",
            "",
        ]
    )

    invites_dir = os.environ.get("AGENT_ICS_DIR", "scripts/generated_invites")
    os.makedirs(invites_dir, exist_ok=True)
    safe_summary = re.sub(r"[^a-zA-Z0-9_-]+", "_", summary).strip("_")[:40] or "meeting"
    filename = f"{int(time.time())}_{safe_summary}.ics"
    filepath = os.path.join(invites_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(ics_content)

    calendar_name = summary[:120]
    calendar_description = description[:1000]
    import_url = (
        "https://calendar.google.com/calendar/u/0/r/settings/createcalendar"
        f"?name={urllib.parse.quote(calendar_name)}"
        f"&description={urllib.parse.quote(calendar_description)}"
    )
    open_browser = os.environ.get("AGENT_OPEN_BROWSER", "true").lower() not in {"0", "false", "no"}
    browser_opened = False
    browser_error = None
    if open_browser:
      try:
          browser_opened = webbrowser.open(import_url, new=2)
      except Exception as exc:  # noqa: BLE001
          browser_error = str(exc)

    return {
        "status": "created",
        "mode": "ics_file",
        "icsPath": filepath,
        "importUrl": import_url,
        "calendarName": calendar_name,
        "calendarDescription": calendar_description,
        "browserOpened": browser_opened,
        "browserError": browser_error,
        "start": start,
        "end": end,
    }


def run_custom_actions(memory: Dict[str, Any], timeout: int) -> List[Dict[str, Any]]:
    actions: List[Dict[str, Any]] = []

    if is_meeting_memory(memory):
        try:
            result = create_google_calendar_event(memory, timeout=timeout)
            status = "success" if result.get("status") == "created" else "skipped"
            actions.append(
                {
                    "action": "meeting_to_google_calendar",
                    "status": status,
                    "result": result,
                }
            )
        except Exception as exc:  # noqa: BLE001
            actions.append(
                {
                    "action": "meeting_to_google_calendar",
                    "status": "failed",
                    "result": {"error": str(exc)},
                }
            )

    if is_goal_memory(memory):
        try:
            result = generate_goal_suggestions(memory, timeout=timeout)
            if result.get("has_goal"):
                actions.append(
                    {
                        "action": "goal_coaching_suggestions",
                        "status": "success",
                        "result": result,
                    }
                )
            else:
                actions.append(
                    {
                        "action": "goal_coaching_suggestions",
                        "status": "skipped",
                        "result": result,
                    }
                )
        except Exception as exc:  # noqa: BLE001
            actions.append(
                {
                    "action": "goal_coaching_suggestions",
                    "status": "failed",
                    "result": {"error": str(exc)},
                }
            )

    return actions


def run_agent(base_url: str, poll_interval: float, timeout: int, state_file: str, backfill: bool) -> None:
    state = load_state(state_file)
    if state["last_created_at"] is None:
        state["last_created_at"] = 0.0 if backfill else time.time() * 1000.0
        save_state(state_file, state)

    print(
        f"[agent] starting base_url={base_url} state={state_file} since={state['last_created_at']} "
        "calendar_mode=ics_file"
    )

    while not STOP:
        try:
            memories = fetch_new_memories(
                base_url=base_url,
                since=float(state["last_created_at"]),
                timeout=timeout,
                limit=100,
            )

            if not memories:
                time.sleep(poll_interval)
                continue

            processed_ids = set(state.get("processed_ids", []))

            for memory in memories:
                memory_id = memory.get("_id")
                created_at = float(memory.get("createdAt", state["last_created_at"]))

                if isinstance(memory_id, str) and memory_id in processed_ids:
                    state["last_created_at"] = max(float(state["last_created_at"]), created_at)
                    continue

                actions = run_custom_actions(memory, timeout=timeout)
                if actions:
                    print(f"[agent] memory={memory_id} actions={json.dumps(actions)}")
                    for action in actions:
                        log_agent_action(
                            base_url=base_url,
                            timeout=timeout,
                            action_type=str(action.get("action", "unknown_action")),
                            status=str(action.get("status", "failed")),
                            memory=memory,
                            details=action.get("result", {}),
                        )
                else:
                    print(f"[agent] memory={memory_id} no matching custom action")

                state["last_created_at"] = max(float(state["last_created_at"]), created_at)
                if isinstance(memory_id, str):
                    processed_ids.add(memory_id)

                state["processed_ids"] = list(processed_ids)[-2000:]
                save_state(state_file, state)

        except Exception as loop_error:  # noqa: BLE001
            print(f"[agent] polling error: {loop_error}")
            time.sleep(max(poll_interval, 2.0))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Convex memory actions agent")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("CONVEX_SITE_URL") or os.environ.get("NEXT_PUBLIC_CONVEX_SITE_URL"),
        help="Convex site URL, e.g. https://<project>.convex.site",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=float(os.environ.get("AGENT_POLL_INTERVAL", "3")),
        help="Seconds between empty polls",
    )
    parser.add_argument(
        "--request-timeout",
        type=int,
        default=int(os.environ.get("AGENT_REQUEST_TIMEOUT", "30")),
        help="HTTP timeout in seconds",
    )
    parser.add_argument(
        "--state-file",
        default=os.environ.get("AGENT_STATE_FILE", "scripts/.convex_agent_state.json"),
        help="File used to persist last processed memory",
    )
    parser.add_argument(
        "--backfill",
        action="store_true",
        help="Process existing historical memories on first run",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.base_url:
        print("Missing Convex site URL. Set --base-url or CONVEX_SITE_URL.")
        return 1

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    run_agent(
        base_url=args.base_url.rstrip("/"),
        poll_interval=args.poll_interval,
        timeout=args.request_timeout,
        state_file=args.state_file,
        backfill=args.backfill,
    )

    print("[agent] stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
