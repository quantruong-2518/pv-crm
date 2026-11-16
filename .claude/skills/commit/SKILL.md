---
name: commit
description: Commit exactly the paths the caller lists, with a Vietnamese message in the repo's voice; never pushes. Use when /check or /build closes a turn, or on "commit đi" / "lưu lại".
context: fork
agent: worker
model: haiku
---

# Commit the caller's paths

Runs as a forked haiku worker, so nothing from the caller's conversation is
visible here: the caller passes everything in `$ARGUMENTS`.

```
<path>                      one per line — the caller's own files
---
<message>                   Vietnamese, no trailer — the caller knows the why
Co-Authored-By: …           optional — overrides the trailer of step 5
on-master                   optional — the owner asked for a commit on master
```

The paths are the whole scope: stage those, commit those, touch nothing else.

## 1 · Branch

`git branch --show-current` is `master` or `main` and there is no `on-master`
line: stop and report. Work goes to a branch; the caller makes it.

## 2 · Tree

```bash
git status --short
git diff HEAD --stat
git diff --cached --name-only
```

Sort every dirty or staged path into **listed** and **other**. A path in `other`
belongs to a parallel session; the tree is _shared_ whenever `other` is not
empty. Then list the `other` paths changed in the last ten minutes:

```bash
find <other paths> -mmin -10     # a hit means the other session is still typing
```

Name those hits in the report. Leave them untouched, stash nothing, delete nothing.

## 3 · Pick the route

- **`other` is empty** — `git add -- <listed>`, then a plain `git commit -F <file>`.
  The `pre-commit` hook runs lint-staged; a red hook is reported verbatim and the
  commit stays undone (the hook is the gate, `--no-verify` would hollow it).
- **`other` is not empty** — `.claude/skills/check/parallel.md` overrides this
  skill: lint-staged stashes every unstaged file, which swallows the other
  session's work. Follow that file end to end, and on the listed code files run
  `pnpm exec prettier --write` and `pnpm exec eslint --fix --max-warnings=0`
  first, because plumbing skips the hook. Its closing step builds the commit in a
  detached worktree and runs `pnpm check` there.

Before the first `git add` (or the snapshot, on the second route): `touch` a
marker file under `mktemp -d` at the start of the run, and just before staging run
`find <listed> -newer <marker>`. A listed file that moved since the run began is
being edited right now — leave it out and say so.

## 4 · Message

The repo's voice, read it from `git log -8 --format=%B`: **one Vietnamese
paragraph**, no `type(scope):` prefix, no bullets, no separate subject line.
It opens on what changed, then says why, in one long sentence chain joined by
`;` and `:` — and carries what a later reader will search for: the ADR number,
the migration number (or "không có migration"), the commit or Fly version when the
change shipped, and what was never run or never seen.

```
Trợ lý CRM prompt v14 và grader của eval chấm đúng hơn: khi tìm không thấy thì thử thêm tối đa một lần với phần tên ngắn hơn rồi trả lời, không tìm lại trong list_customers hay list_my_work (Gemini từng tìm 5–7 lần tới trần 8 vòng ở 14 lượt scope); …
```

The caller's message is used as given; check only its shape (Vietnamese, one
paragraph, no prefix). With no message, draft one from `git diff --cached` using
only what the diff shows, and say in the report that the caller should read it.
Identifiers, paths and code stay in their own language inside the Vietnamese.

## 5 · Trailer

After a blank line: the `Co-Authored-By:` line from the args, else the one in
`git log -1 --format=%B`. The model name moves with every release, so the line is
copied, never typed from memory.

## 6 · Report

```bash
git show --stat --format='%h %s' HEAD
git status --short
```

Done when `--stat` lists exactly the listed paths. Report the hash, the first
80 characters of the message, the `other` paths still dirty (marking the ten-minute
hits), and any listed file left out. The push belongs to the owner's word.
