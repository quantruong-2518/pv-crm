#!/usr/bin/env python3
"""SessionStart hook: list the open `.claude/HANDOFF-*.md` files of this checkout.
Ported from the MCS frontend repo (there: docs/plans/INDEX.md); pv-crm keeps one file per topic.

A handoff is the file a session writes when its context runs out (see context_guard.py), in
Vietnamese. A fresh session must not guess which topic to resume, so this hook injects the
list, newest first, with each file's first heading and age, and tells Claude to ask the owner only when the first message names no task.
Age comes from the last commit that touched the file (a fresh checkout resets every mtime);
a file that is untracked or modified uses its mtime.

Reads the project dir only: every worktree tracks its own handoffs per branch.
Registered for `startup` and `clear` (a fresh start). Never blocks; always exits 0. Stdlib only.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

MAX_LISTED = 8


def _git(args: list[str], cwd: Path) -> str | None:
    try:
        proc = subprocess.run(
            ["git", *args], cwd=cwd, capture_output=True, text=True, timeout=5, check=False
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return proc.stdout if proc.returncode == 0 else None


def heading(path: Path) -> str:
    """First markdown heading of the file, without the `#`; the file name when there is none."""
    try:
        with path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if line.startswith("#"):
                    return line.lstrip("#").strip() or path.name
    except OSError:
        pass
    return path.name


def ages(project_dir: Path, files: list[Path], now: float) -> dict[Path, float]:
    """Seconds since each file last changed: commit time when tracked and clean, else mtime."""
    dirty = _git(["status", "--porcelain", "--", ".claude"], project_dir) or ""
    touched = {line[3:].strip().strip('"') for line in dirty.splitlines()}
    result: dict[Path, float] = {}
    for path in files:
        rel = f".claude/{path.name}"
        stamp = None if rel in touched else _git(["log", "-1", "--format=%ct", "--", rel], project_dir)
        try:
            when = float(stamp.strip()) if stamp and stamp.strip() else path.stat().st_mtime
        except (ValueError, OSError):
            when = now
        result[path] = max(0.0, now - when)
    return result


def human_age(seconds: float) -> str:
    days = int(seconds // 86400)
    if days >= 1:
        return f"{days}d"
    return f"{int(seconds // 3600)}h"


def build(project_dir: Path, now: float) -> dict | None:
    files = sorted((project_dir / ".claude").glob("HANDOFF-*.md"))
    if not files:
        return None
    age = ages(project_dir, files, now)
    ordered = sorted(files, key=lambda p: age[p])
    listed = "\n".join(
        f"- `.claude/{p.name}` ({human_age(age[p])} old): {heading(p)}" for p in ordered[:MAX_LISTED]
    )
    if len(ordered) > MAX_LISTED:
        listed += f"\n- ... and {len(ordered) - MAX_LISTED} older"
    context = (
        f"Open handoff files in this checkout, newest first:\n{listed}\n\n"
        "If the owner's first message does not name a task, ask ONE question in Vietnamese: which "
        "handoff to resume, one option per file above plus 'a new topic', your recommendation first "
        "(usually the newest). When the first message already names a task, do not ask. Read the "
        "handoff you resume before acting and keep it current. Never delete or rewrite a handoff "
        "you did not choose; retiring old ones is the job of the doc-keeper agent."
    )
    return {
        "systemMessage": f"{len(files)} handoff file(s) in .claude/: Claude asks which to resume.",
        "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context},
    }


def main() -> int:
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path.cwd())
    out = build(project_dir, time.time())
    if out is not None:
        sys.stdout.write(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # a reminder must never break session start
        sys.exit(0)
