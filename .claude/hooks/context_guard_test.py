"""Run: python3 -B -m unittest discover -s .claude/hooks -p '*_test.py'"""

import json
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

import context_guard as cg

HOOK = Path(cg.__file__)


def assistant(tokens, **extra):
    usage = {"input_tokens": 1, "cache_creation_input_tokens": 0, "cache_read_input_tokens": tokens - 1}
    return {"type": "assistant", "message": {"model": "m", "usage": usage}, **extra}


class ContextGuardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.session = f"test-{uuid.uuid4().hex}"
        self.addCleanup(lambda: cg._marker(self.session).unlink(missing_ok=True))

    def transcript(self, *lines):
        path = Path(self.tmp.name) / "t.jsonl"
        path.write_text("\n".join(json.dumps(line) for line in lines) + "\n", encoding="utf-8")
        return str(path)

    def run_hook(self, event, tokens, **payload):
        path = self.transcript(assistant(tokens))
        payload = {"hook_event_name": event, "session_id": self.session, "transcript_path": path, **payload}
        done = subprocess.run([sys.executable, "-B", str(HOOK)], input=json.dumps(payload),
                              capture_output=True, text=True, check=False)
        self.assertEqual(done.returncode, 0)
        return json.loads(done.stdout) if done.stdout else None

    def test_thresholds_match_the_global_status_line(self):
        self.assertEqual((cg.WARN_TOKENS, cg.HANDOFF_TOKENS), (200_000, 250_000))

    def test_token_count_uses_the_last_main_chain_assistant_line(self):
        path = self.transcript(assistant(10), assistant(999_999, isSidechain=True), {"type": "user"})
        self.assertEqual(cg.token_count(path), 10)

    def test_compact_boundary_resets_to_post_tokens(self):
        boundary = {"type": "system", "subtype": "compact_boundary", "compactMetadata": {"postTokens": 42}}
        self.assertEqual(cg.token_count(self.transcript(assistant(300_000), boundary)), 42)

    def test_prompt_below_warn_is_silent(self):
        self.assertIsNone(self.run_hook("UserPromptSubmit", 100_000))

    def test_prompt_warns_then_demands_handoff_in_vietnamese_file(self):
        warn = self.run_hook("UserPromptSubmit", 210_000)
        self.assertIn("warn level", warn["systemMessage"])
        handoff = self.run_hook("UserPromptSubmit", 260_000)
        text = handoff["hookSpecificOutput"]["additionalContext"]
        self.assertIn(".claude/HANDOFF-<slug>.md", text)
        self.assertIn("Vietnamese", text)

    def test_stop_blocks_once_per_session(self):
        first = self.run_hook("Stop", 260_000)
        self.assertEqual(first["decision"], "block")
        self.assertIsNone(self.run_hook("Stop", 260_000))
        self.assertIsNone(self.run_hook("Stop", 100_000))  # back below warn: marker cleared
        self.assertEqual(self.run_hook("Stop", 260_000)["decision"], "block")

    def test_subagents_and_stop_retries_are_skipped(self):
        self.assertIsNone(self.run_hook("Stop", 260_000, agent_id="a1"))
        self.assertIsNone(self.run_hook("Stop", 260_000, stop_hook_active=True))

    def test_bad_input_exits_zero(self):
        done = subprocess.run([sys.executable, "-B", str(HOOK)], input="nope", capture_output=True, text=True)
        self.assertEqual((done.returncode, done.stdout), (0, ""))


if __name__ == "__main__":
    unittest.main()
