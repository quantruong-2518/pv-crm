#!/usr/bin/env python3
"""Stop hook worker: typecheck the touched tsconfigs and lint the files this session edited.
Called by quality-gate.sh with the Stop payload on stdin.

Scope: only files the MAIN thread of THIS session edited (tools/scripts/on-edit.mjs appends them to
`$TMPDIR/claude-pvcrm-edits/<session_id>.txt`) that are still changed vs HEAD and are .ts/.tsx.
No list, or an empty one, exits 0 at once. Subagent work is checked by `/check`, not here. Web
files run `tsc -p tsconfig.web.json`, api files `tsc -p tsconfig.api.json`, shared packages both;
tsc errors in files outside the list are dropped, eslint runs on the list only. No tests, no build.

On errors it prints one `decision: block` JSON with a grouped summary (per tool: count, then the
first few files); the retry is let through by `stop_hook_active`. It fails open (exit 0, a line on
stderr) when tools are missing, crash, or run past the budget: this hook must not wedge a turn.
Stdlib only.
"""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import IO

BUDGET_SECONDS = 150  # settings.json gives the hook 180
MAX_LINT_FILES = 300
SHOWN_FILES = 5
WEB = ("apps/web/", "packages/ui/", "packages/tokens/", "packages/engines/", "alias.config.ts", "vitest")
API = ("apps/api/", "packages/contracts/", "packages/mail-templates/", "packages/engines/")
TSC_ERROR = re.compile(r"^(?P<file>[^\s(][^(]*)\((?P<line>\d+),\d+\): error (?P<code>TS\d+): (?P<msg>.*)$")


def targets(files: list[str]) -> list[str]:
    """Names of the tsconfigs the changed files can break."""
    found = []
    if any(f.startswith(WEB) for f in files):
        found.append("web")
    if any(f.startswith(API) for f in files):
        found.append("api")
    return found


def parse_tsc(output: str) -> list[tuple[str, str]]:
    """(file, 'line TScode message') per error line."""
    errors = []
    for line in output.splitlines():
        match = TSC_ERROR.match(line.strip())
        if match:
            errors.append((match["file"], f"{match['line']} {match['code']} {match['msg'][:110]}"))
    return errors


def parse_eslint(output: str) -> list[tuple[str, str]]:
    """(file, 'line rule message') per error-severity message; raises ValueError on non-JSON."""
    errors = []
    for entry in json.loads(output):
        rel = os.path.relpath(entry["filePath"])
        for msg in entry.get("messages", []):
            if msg.get("severity") == 2:
                errors.append((rel, f"{msg.get('line', 0)} {msg.get('ruleId') or 'parse'} {msg['message'][:110]}"))
    return errors


def group(title: str, errors: list[tuple[str, str]]) -> str:
    """One block: `title: N errors in M files`, then the first files with their first message."""
    by_file: dict[str, list[str]] = {}
    for file, text in errors:
        by_file.setdefault(file, []).append(text)
    lines = [f"{title}: {len(errors)} error(s) in {len(by_file)} file(s)"]
    for file, texts in list(by_file.items())[:SHOWN_FILES]:
        more = f" (+{len(texts) - 1} more)" if len(texts) > 1 else ""
        lines.append(f"  {file}: {texts[0]}{more}")
    if len(by_file) > SHOWN_FILES:
        lines.append(f"  ... {len(by_file) - SHOWN_FILES} more file(s)")
    return "\n".join(lines)


def edits_file(session_id: object) -> Path | None:
    """Where on-edit.mjs records the main thread's edits; None for an id that is not a plain token."""
    if not isinstance(session_id, str) or not re.fullmatch(r"[\w.-]+", session_id):
        return None
    return Path(os.environ.get("TMPDIR") or "/tmp") / "claude-pvcrm-edits" / f"{session_id}.txt"


def session_files(session_id: object, cwd: Path) -> set[str]:
    """Repo-relative .ts/.tsx files the main thread edited this session; empty when none are recorded."""
    path = edits_file(session_id)
    try:
        lines = path.read_text(encoding="utf-8").splitlines() if path else []
    except OSError:
        return set()
    root = os.path.realpath(cwd)
    files = set()
    for line in lines:
        rel = os.path.relpath(os.path.realpath(line.strip()), root) if line.strip() else ".."
        if not rel.startswith("..") and rel.endswith((".ts", ".tsx")):
            files.add(rel)
    return files


def changed_vs_head() -> set[str]:
    """Files modified, added or untracked relative to HEAD (deleted files are left out)."""
    found: set[str] = set()
    for args in (["diff", "--name-only", "--diff-filter=d", "HEAD"], ["ls-files", "--others", "--exclude-standard"]):
        done = subprocess.run(["git", *args], capture_output=True, text=True, check=False)  # noqa: S603, S607
        found.update(line for line in done.stdout.splitlines() if line)
    return found


def spawn(args: list[str]) -> tuple[subprocess.Popen, IO[str]]:
    """Start a job whose output goes to a temp file: a pipe nobody drains blocks the child at 64 KB."""
    out = tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace")
    return subprocess.Popen(  # noqa: S603
        args, stdout=out, stderr=subprocess.STDOUT, text=True, start_new_session=True
    ), out


def collect(
    jobs: dict[str, tuple[subprocess.Popen, IO[str]]], deadline: float
) -> dict[str, tuple[int, str]] | None:
    """(exit code, output) per job, or None when the budget ran out (every job group is then killed)."""
    out: dict[str, tuple[int, str]] = {}
    pending = dict(jobs)
    while pending:
        for name, (proc, file) in list(pending.items()):
            code = proc.poll()
            if code is not None:
                file.seek(0)
                out[name] = (code, file.read())
                file.close()
                del pending[name]
        if pending and time.monotonic() > deadline:
            for proc, file in pending.values():
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    pass
                file.close()
            return None
        if pending:
            time.sleep(0.2)
    return out


def tsc_errors(output: str, code: int, files: set[str]) -> list[tuple[str, str]]:
    """Parsed tsc errors in `files`; a non-zero exit with no error line reports its first line instead."""
    parsed = parse_tsc(output)
    if not parsed and code != 0:
        first = next((line.strip() for line in output.splitlines() if line.strip()), f"exit code {code}")
        return [("tsc", first[:160])]
    return [(file, text) for file, text in parsed if file in files]


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return 0
    if not isinstance(payload, dict):
        return 0
    files = session_files(payload.get("session_id"), Path.cwd())
    if not files or not Path("node_modules").is_dir():
        return 0  # nothing edited by this session, or no dependencies installed (a fresh worktree)
    files &= changed_vs_head()
    if not files:
        return 0
    ordered = sorted(files)[:MAX_LINT_FILES]
    jobs = {f"typecheck {t}": spawn(["pnpm", "exec", "tsc", "-p", f"tsconfig.{t}.json", "--pretty", "false"])
            for t in targets(ordered)}
    jobs["eslint"] = spawn(["pnpm", "exec", "eslint", "--no-warn-ignored", "--pass-on-unpruned-suppressions",
                            "-f", "json", *ordered])
    results = collect(jobs, time.monotonic() + BUDGET_SECONDS)
    if results is None:
        sys.stderr.write(f"quality-gate: over {BUDGET_SECONDS}s, skipped\n")
        return 0
    blocks = []
    for name, (code, output) in results.items():
        try:
            errors = parse_eslint(output) if name == "eslint" else tsc_errors(output, code, files)
        except (ValueError, KeyError, TypeError):
            sys.stderr.write(f"quality-gate: {name} gave no readable result, skipped\n")
            continue
        if errors:
            blocks.append(group(name, errors))
    if blocks:
        reason = (
            "Quality gate failed on files you edited this session. Fix them before finishing.\n\n"
            + "\n".join(blocks)
            + "\n\nFull output: pnpm check:fast"
        )
        sys.stdout.write(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # a gate must not wedge the session
        sys.stderr.write(f"quality-gate: skipped after {type(exc).__name__}: {exc}\n")
        sys.exit(0)
