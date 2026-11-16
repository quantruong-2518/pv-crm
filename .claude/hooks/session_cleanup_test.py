"""Run: python3 -B -m unittest discover -s .claude/hooks -p '*_test.py'"""

import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

import session_cleanup as sc

LATER = time.time() + 48 * 3600  # idle limit is 24 h, so every worktree counts as idle


def git(cwd, *args):
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-C", str(cwd), *args],
        check=True, capture_output=True,
    )


class CleanupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name).resolve()
        self.main, self.wt = root / "main", root / "pv-crm-topic"
        self.sessions = root / "sessions"
        self.sessions.mkdir()
        git(root, "init", "-q", str(self.main))
        git(self.main, "symbolic-ref", "HEAD", "refs/heads/master")
        git(self.main, "commit", "-q", "--allow-empty", "-m", "i")
        git(self.main, "worktree", "add", "-q", "-b", "topic", str(self.wt))

    def tearDown(self):
        self.tmp.cleanup()

    def run_cleanup(self, **kwargs):
        kwargs.setdefault("current", self.main)
        return sc.cleanup(self.main, now=LATER, sessions_dir=self.sessions, **kwargs)

    def kept(self, report):
        return {k["target"]: k["reason"] for k in report["kept"]}

    def test_dry_run_reports_and_changes_nothing(self):
        report = self.run_cleanup(dry_run=True)
        self.assertEqual([w["target"] for w in report["removed_worktrees"]], [str(self.wt)])
        self.assertEqual([b["target"] for b in report["deleted_branches"]], ["topic"])
        self.assertTrue(self.wt.is_dir())
        self.assertIn("topic", subprocess.run(["git", "-C", str(self.main), "branch"], capture_output=True, text=True).stdout)
        self.assertFalse(list((self.main / ".git").glob("claude-session-cleanup*")))

    def test_apply_removes_and_logs(self):
        self.run_cleanup(dry_run=False)
        self.assertFalse(self.wt.exists())
        self.assertTrue((self.main / ".git" / sc.LOG_NAME).is_file())

    def test_default_without_apply_is_dry_run(self):
        self.assertTrue(sc.parse_args(["--dry-run"])[0])
        self.assertTrue(sc.parse_args([])[0])
        self.assertFalse(sc.parse_args(["--apply"])[0])

    def test_current_session_directory_is_kept(self):
        report = self.run_cleanup(dry_run=True, current=self.wt)
        self.assertEqual(report["removed_worktrees"], [])
        self.assertEqual(self.kept(report)[str(self.wt)], "current session directory")

    def test_a_handoff_naming_the_worktree_keeps_it(self):
        claude = self.main / ".claude"
        claude.mkdir()
        (claude / "HANDOFF-x.md").write_text("continue in pv-crm-topic\n", encoding="utf-8")
        report = self.run_cleanup(dry_run=True)
        self.assertEqual(report["removed_worktrees"], [])
        self.assertIn("HANDOFF-x.md", self.kept(report)[str(self.wt)])

    def test_unmerged_dirty_and_env_keep_the_worktree(self):
        (self.wt / "f.txt").write_text("x")
        self.assertIn("untracked", self.kept(self.run_cleanup(dry_run=True))[str(self.wt)])
        (self.wt / "f.txt").unlink()
        git(self.wt, "commit", "-q", "--allow-empty", "-m", "ahead")
        self.assertIn("not merged", self.kept(self.run_cleanup(dry_run=True))[str(self.wt)])

    def test_env_and_pglite_are_not_regenerable(self):
        for name in ("apps/api/.env", "apps/api/.pglite/", "node_modules/", "dist/", ".husky/_/h"):
            self.assertEqual(sc.is_regenerable(name), name in ("node_modules/", "dist/", ".husky/_/h"), name)

    def test_not_idle_worktree_is_kept(self):
        report = sc.cleanup(self.main, current=self.main, dry_run=True, sessions_dir=self.sessions)
        self.assertEqual(report["removed_worktrees"], [])

    def test_live_session_inside_the_worktree_is_kept(self):
        (self.sessions / "1.json").write_text(f'{{"pid": {os.getpid()}, "cwd": "{self.wt}"}}')
        report = self.run_cleanup(dry_run=True)
        self.assertEqual(self.kept(report)[str(self.wt)], "live session")

    def test_review_reminder_speaks_only_when_asked_or_idle(self):
        self.assertIn("only if the owner asks about cleanup or has no task", sc.REVIEW_REMINDER)


if __name__ == "__main__":
    unittest.main()
