#!/usr/bin/env python3
"""PreToolUse guard: a build agent runs on opus only when its brief says why.
Ported from the MCS frontend repo (there: executor agents stay on sonnet or haiku).

Reads the Claude Code hook payload on stdin. For an Agent (older Claude Code: Task) call that
spawns a BUILD agent with an explicit `model` that is not sonnet or haiku, the prompt must carry a
line `Why opus: <reason>`; without it the call is denied. This is the rule `/build` states.

A spawn of `claude`, `general-purpose` or with no `subagent_type` must name a `model`: without
one it inherits the orchestrator's (opus). Ported from MCS; the call is denied.

Allowed without a check: forks, a missing `model` on a named repo agent (its frontmatter applies),
every reader or reviewer (opus there is the point), `general-purpose` with a model (used as a
reviewer) and any agent not named below.

Exit 0, no output -> no decision. Exit 0 with JSON deny -> blocked, reason shown to Claude.
Exit 2 -> any crash (bad stdin, unexpected shape) blocks, and `"onFailure": "block"` in
settings.json blocks a hook that cannot start or times out. Stdlib only.
"""

from __future__ import annotations

import json
import re
import sys

AGENT_TOOLS = frozenset({"Agent", "Task"})
BUILD_AGENTS = frozenset(
    {
        "api-builder",
        "screen-builder",
        "migration-writer",
        "capture-builder",
        "contract-drafter",
        "fixture-keeper",
        "doc-keeper",
        "deploy-guardian",
        "worker",
        "claude",  # catch-all with every tool: it builds
    }
)
INHERITING_AGENTS = frozenset({"", "claude", "general-purpose"})  # no frontmatter model to fall back on
CHEAP_MODELS = ("sonnet", "haiku")
WHY_OPUS = re.compile(r"^[\s>*_`-]*Why opus:\s*\S", re.IGNORECASE | re.MULTILINE)


def _deny(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }


def _text(tool_input: dict, key: str) -> str:
    value = tool_input.get(key)
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError(f"{key} must be a string, got {type(value).__name__}")
    return value


def decide(payload: dict) -> dict | None:
    """Return a PreToolUse deny decision, or None for no decision."""
    if payload.get("tool_name") not in AGENT_TOOLS:
        return None
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        raise ValueError(f"tool_input must be a JSON object, got {type(tool_input).__name__}")
    agent = _text(tool_input, "subagent_type").strip().lower()
    model = _text(tool_input, "model").strip().lower()
    prompt = _text(tool_input, "prompt")
    if not model and agent in INHERITING_AGENTS:
        return _deny(
            f"Blocked: {agent or 'an agent with no subagent_type'} without a `model` inherits the "
            "orchestrator's model (opus). Name a model in the call: sonnet or haiku to build, opus only "
            "to review or read."
        )
    if agent not in BUILD_AGENTS or not model or any(m in model for m in CHEAP_MODELS):
        return None
    if WHY_OPUS.search(prompt):
        return None
    return _deny(
        f"Blocked: {agent} is a build agent and model={model} is not sonnet or haiku. Add a line "
        "`Why opus: <reason>` to the prompt (no gold example to copy, or it touches "
        "permissions, money or an invariant), or run it on sonnet. Reviewers and readers may use opus."
    )


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        if not isinstance(payload, dict):
            raise ValueError(f"hook payload must be a JSON object, got {type(payload).__name__}")
        decision = decide(payload)
    except Exception as exc:  # fail closed: exit 2 is the only non-zero code that blocks
        sys.stderr.write(f"guard_agent_tier: internal error, blocking the call: {exc!r}\n")
        return 2
    if decision is not None:
        sys.stdout.write(json.dumps(decision))
    return 0


if __name__ == "__main__":
    sys.exit(main())
