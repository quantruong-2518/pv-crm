"""Run: python3 -B -m unittest discover -s .claude/hooks -p '*_test.py'"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

import guard_agent_tier as g

HOOK = Path(__file__).with_name("guard_agent_tier.py")


def call(agent=None, model=None, prompt="Build the thing.", tool="Agent"):
    tool_input = {"prompt": prompt}
    if agent is not None:
        tool_input["subagent_type"] = agent
    if model is not None:
        tool_input["model"] = model
    return {"tool_name": tool, "tool_input": tool_input}


def denied(payload):
    decision = g.decide(payload)
    return decision is not None and decision["hookSpecificOutput"]["permissionDecision"] == "deny"


class DecideTest(unittest.TestCase):
    def test_build_agent_on_opus_needs_why(self):
        for agent in sorted(g.BUILD_AGENTS):
            self.assertTrue(denied(call(agent, "opus")), agent)
            self.assertFalse(denied(call(agent, "opus", "Why opus: touches permissions.")), agent)

    def test_empty_or_embedded_why_does_not_count(self):
        self.assertTrue(denied(call("api-builder", "opus", "Why opus:")))
        self.assertTrue(denied(call("api-builder", "opus", "no Why opus: here, mid-line")))

    def test_why_line_may_be_decorated_or_anywhere(self):
        prompt = "Brief.\n\n- **Why opus:** no gold example.\nMore."
        self.assertFalse(denied(call("api-builder", "opus", prompt)))
        prompt = "Brief.\n> why opus: no gold example.\nMore."
        self.assertFalse(denied(call("api-builder", "opus", prompt)))

    def test_cheap_models_and_missing_model_pass(self):
        for model in (None, "", "sonnet", "haiku", "claude-sonnet-5-5"):
            self.assertFalse(denied(call("screen-builder", model)), model)

    def test_inheriting_agents_must_name_a_model(self):
        for agent in (None, "", "claude", "general-purpose", "General-Purpose"):
            self.assertTrue(denied(call(agent)), agent)
            self.assertIn("Name a model", g.decide(call(agent))["hookSpecificOutput"]["permissionDecisionReason"])
            self.assertFalse(denied(call(agent, "sonnet")), agent)

    def test_forks_and_named_repo_agents_may_omit_the_model(self):
        for agent in ("fork", "worker", "api-builder", "rules-reviewer", "Explore"):
            self.assertFalse(denied(call(agent)), agent)

    def test_deny_text_for_an_unclassified_model_does_not_say_above_sonnet(self):
        reason = g.decide(call("worker", "inherit"))["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertIn("not sonnet or haiku", reason)

    def test_any_other_model_on_a_build_agent_is_gated(self):
        for model in ("fable", "Opus", "claude-opus-4-1", "inherit"):
            self.assertTrue(denied(call("worker", model)), model)

    def test_readers_reviewers_and_unknown_agents_may_use_opus(self):
        for agent in ("rules-reviewer", "aurora-reviewer", "screen-inspector", "dataflow-tracer",
                      "rule-locator", "Explore", "Plan", "general-purpose", "fork", "statusline-setup"):
            self.assertFalse(denied(call(agent, "opus")), agent)

    def test_missing_agent_counts_as_general_purpose(self):
        self.assertFalse(denied(call(None, "opus")))

    def test_agent_name_is_case_insensitive_and_task_is_covered(self):
        self.assertTrue(denied(call("API-Builder", "opus")))
        self.assertTrue(denied(call("api-builder", "opus", tool="Task")))

    def test_other_tools_are_ignored(self):
        self.assertIsNone(g.decide({"tool_name": "Bash", "tool_input": {"command": "ls"}}))

    def test_malformed_input_raises(self):
        with self.assertRaises(ValueError):
            g.decide({"tool_name": "Agent", "tool_input": "x"})
        with self.assertRaises(ValueError):
            g.decide(call("api-builder", prompt=5))


class ProcessTest(unittest.TestCase):
    def run_hook(self, stdin):
        return subprocess.run(
            [sys.executable, "-B", str(HOOK)], input=stdin, capture_output=True, text=True, check=False
        )

    def test_deny_prints_json_and_exits_zero(self):
        done = self.run_hook(json.dumps(call("api-builder", "opus")))
        self.assertEqual(done.returncode, 0)
        self.assertEqual(json.loads(done.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_allow_prints_nothing(self):
        done = self.run_hook(json.dumps(call("api-builder", "sonnet")))
        self.assertEqual((done.returncode, done.stdout), (0, ""))

    def test_crash_exits_two(self):
        for stdin in ("not json", "[]", json.dumps({"tool_name": "Agent", "tool_input": []})):
            self.assertEqual(self.run_hook(stdin).returncode, 2, stdin)


if __name__ == "__main__":
    unittest.main()
