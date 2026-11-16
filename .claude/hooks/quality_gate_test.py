"""Run: python3 -B -m unittest discover -s .claude/hooks -p '*_test.py'"""

import json
import os
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import quality_gate as q


class QualityGateTest(unittest.TestCase):
    def test_targets_follow_the_tsconfig_includes(self):
        self.assertEqual(q.targets(["apps/web/src/a.tsx"]), ["web"])
        self.assertEqual(q.targets(["apps/api/src/a.ts"]), ["api"])
        self.assertEqual(q.targets(["packages/engines/src/a.ts"]), ["web", "api"])
        self.assertEqual(q.targets(["packages/contracts/src/a.ts", "packages/ui/src/b.tsx"]), ["web", "api"])
        self.assertEqual(q.targets(["tools/eslint-plugin-aurora/a.ts"]), [])

    def test_parse_tsc(self):
        out = "apps/web/src/a.tsx(12,5): error TS2322: Type 'x' is not assignable.\nnoise\n"
        self.assertEqual(q.parse_tsc(out), [("apps/web/src/a.tsx", "12 TS2322 Type 'x' is not assignable.")])

    def test_parse_eslint_keeps_errors_only(self):
        data = [{"filePath": "/x/a.ts", "messages": [
            {"severity": 2, "line": 3, "ruleId": "aurora/comment-budget", "message": "too long"},
            {"severity": 1, "line": 4, "ruleId": "w", "message": "warn"}]}]
        errors = q.parse_eslint(json.dumps(data))
        self.assertEqual(len(errors), 1)
        self.assertIn("aurora/comment-budget", errors[0][1])
        with self.assertRaises(ValueError):
            q.parse_eslint("not json")

    def test_group_is_short(self):
        errors = [(f"f{i}.ts", f"1 TS1 m{i}") for i in range(7)] + [("f0.ts", "2 TS2 second")]
        text = q.group("typecheck web", errors)
        self.assertIn("8 error(s) in 7 file(s)", text)
        self.assertIn("f0.ts: 1 TS1 m0 (+1 more)", text)
        self.assertIn("... 2 more file(s)", text)
        self.assertLessEqual(len(text.splitlines()), q.SHOWN_FILES + 2)


class CollectTest(unittest.TestCase):
    def test_a_child_printing_300kb_does_not_deadlock(self):
        job = q.spawn([sys.executable, "-c", "print('x' * 300000)"])
        done = q.collect({"big": job}, time.monotonic() + 30)
        self.assertIsNotNone(done)
        code, output = done["big"]
        self.assertEqual(code, 0)
        self.assertGreaterEqual(len(output), 300000)

    def test_stderr_is_captured_and_a_slow_child_is_killed_at_the_deadline(self):
        job = q.spawn([sys.executable, "-c", "import sys; sys.stderr.write('boom')"])
        self.assertEqual(q.collect({"e": job}, time.monotonic() + 30)["e"], (0, "boom"))
        slow = q.spawn([sys.executable, "-c", "import time; time.sleep(60)"])
        self.assertIsNone(q.collect({"s": slow}, time.monotonic() - 1))


class TscErrorsTest(unittest.TestCase):
    def test_only_files_of_this_session_are_reported(self):
        out = "a.ts(1,1): error TS1: mine\nb.ts(2,2): error TS2: not mine\n"
        self.assertEqual(q.tsc_errors(out, 2, {"a.ts"}), [("a.ts", "1 TS1 mine")])
        self.assertEqual(q.tsc_errors(out, 2, {"c.ts"}), [])

    def test_nonzero_exit_without_an_error_line_reports_the_first_line(self):
        out = "\n error TS6053: File 'tsconfig.web.json' not found.\nmore\n"
        self.assertEqual(q.tsc_errors(out, 1, set()), [("tsc", "error TS6053: File 'tsconfig.web.json' not found.")])
        self.assertEqual(q.tsc_errors("", 0, set()), [])
        self.assertEqual(q.tsc_errors("", 3, set()), [("tsc", "exit code 3")])


class SessionScopeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.tmpdir = self.root / "tmp"
        (self.tmpdir / "claude-pvcrm-edits").mkdir(parents=True)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        (self.repo / "node_modules").mkdir()
        for args in (["init", "-q"],):
            subprocess.run(["git", "-C", str(self.repo), *args], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(self.repo), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q",
                        "--allow-empty", "-m", "i"], check=True, capture_output=True)
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        fake = bin_dir / "pnpm"
        fake.write_text(
            "#!/bin/sh\ntouch \"$FAKE_MARK\"\n"
            "case \"$*\" in\n"
            "  *tsc*) echo 'apps/web/src/mine.ts(1,1): error TS1: bad'; echo 'apps/web/src/other.ts(1,1): error TS2: bad'; exit 2;;\n"
            "  *) echo '[]';;\nesac\n"
        )
        fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
        self.env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "TMPDIR": str(self.tmpdir),
                    "FAKE_MARK": str(self.root / "ran")}
        for name in ("mine", "other"):
            path = self.repo / "apps/web/src" / f"{name}.ts"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("export {}\n")

    def record(self, session, *names):
        lines = "".join(f"{self.repo}/apps/web/src/{n}.ts\n" for n in names)
        (self.tmpdir / "claude-pvcrm-edits" / f"{session}.txt").write_text(lines)

    def gate(self, session):
        payload = json.dumps({"session_id": session})
        return subprocess.run([sys.executable, "-B", str(Path(q.__file__))], input=payload, cwd=self.repo,
                              env=self.env, capture_output=True, text=True, check=False)

    def test_no_list_exits_at_once_without_running_anything(self):
        done = self.gate("none")
        self.assertEqual((done.returncode, done.stdout), (0, ""))
        self.assertFalse((self.root / "ran").exists())

    def test_reports_only_files_this_session_edited(self):
        self.record("s1", "mine")
        out = json.loads(self.gate("s1").stdout)
        self.assertEqual(out["decision"], "block")
        self.assertIn("mine.ts", out["reason"])
        self.assertNotIn("other.ts", out["reason"])

    def test_a_session_that_edited_nothing_here_is_silent_despite_other_dirty_files(self):
        self.record("s2")
        self.assertEqual(self.gate("s2").stdout, "")
        self.assertFalse((self.root / "ran").exists())

    def test_session_files_keeps_ts_under_the_repo_and_drops_the_rest(self):
        (self.tmpdir / "claude-pvcrm-edits" / "s3.txt").write_text(
            f"{self.repo}/a.ts\n{self.repo}/b.md\n/elsewhere/c.ts\n\n{self.repo}/d.tsx\n"
        )
        with mock.patch.dict(os.environ, {"TMPDIR": str(self.tmpdir)}):
            self.assertEqual(q.session_files("s3", self.repo), {"a.ts", "d.tsx"})
            self.assertEqual(q.session_files("../x", self.repo), set())
            self.assertEqual(q.session_files(None, self.repo), set())


if __name__ == "__main__":
    unittest.main()
