#!/usr/bin/env bash
# Stop hook: hands the Stop payload to quality_gate.py, which checks only the .ts/.tsx files this
# session's main thread edited (typecheck of the touched tsconfigs + eslint on those files).
# Bash 3.2 safe (macOS); JSON handling and the edit list live in the python half.
set -u

here=$(cd "$(dirname "$0")" && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

input=$(cat)
case $input in
  *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;; # already inside a retry
esac

printf '%s' "$input" | exec python3 -B "$here/quality_gate.py"
