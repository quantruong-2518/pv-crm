"""Run: python3 -B -m unittest discover -s .claude/hooks -p '*_test.py'"""

import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

import handoff_reminder as hr


class HandoffReminderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / ".claude").mkdir()

    def write(self, name, text, age_days):
        path = self.root / ".claude" / name
        path.write_text(text, encoding="utf-8")
        stamp = time.time() - age_days * 86400
        os.utime(path, (stamp, stamp))

    def test_no_handoffs_means_silence(self):
        self.assertIsNone(hr.build(self.root, time.time()))

    def test_lists_newest_first_with_heading_and_age(self):
        self.write("HANDOFF-old.md", "# Cũ\n", 20)
        self.write("HANDOFF-new.md", "intro\n# Mới nhất\n", 1)
        out = hr.build(self.root, time.time())
        lines = out["hookSpecificOutput"]["additionalContext"].splitlines()
        self.assertIn("HANDOFF-new.md` (1d old): Mới nhất", lines[1])
        self.assertIn("HANDOFF-old.md` (20d old): Cũ", lines[2])
        self.assertIn("2 handoff file", out["systemMessage"])

    def test_age_comes_from_the_commit_when_the_file_is_tracked_and_clean(self):
        self.write("HANDOFF-a.md", "# A\n", 0)
        for args in (["init", "-q"], ["add", "-A"]):
            subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)
        env = {**os.environ, "GIT_AUTHOR_DATE": "2020-01-01T00:00:00", "GIT_COMMITTER_DATE": "2020-01-01T00:00:00"}
        subprocess.run(["git", "-C", str(self.root), "-c", "user.name=t", "-c", "user.email=t@t",
                        "commit", "-q", "-m", "x"], check=True, capture_output=True, env=env)
        age = hr.ages(self.root, [self.root / ".claude" / "HANDOFF-a.md"], time.time())
        self.assertGreater(list(age.values())[0], 365 * 86400)

    def test_asks_only_when_the_first_message_names_no_task(self):
        self.write("HANDOFF-a.md", "# A\n", 1)
        text = hr.build(self.root, time.time())["hookSpecificOutput"]["additionalContext"]
        self.assertIn("does not name a task, ask ONE question in Vietnamese", text)
        self.assertNotIn("Before other work", text)

    def test_caps_the_list(self):
        for i in range(hr.MAX_LISTED + 2):
            self.write(f"HANDOFF-{i}.md", f"# T{i}\n", i)
        text = hr.build(self.root, time.time())["hookSpecificOutput"]["additionalContext"]
        self.assertIn("and 2 older", text)


if __name__ == "__main__":
    unittest.main()
