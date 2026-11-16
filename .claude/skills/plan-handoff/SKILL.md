---
name: plan-handoff
description: Write or resume the pv-crm handoff — `.claude/HANDOFF-<slug>.md` in Vietnamese plus one memory pointer — so a cold session continues without re-deriving. Use when a turn ends with work unshipped, before a long pause or compaction, and on "bàn giao" / "viết handoff" / "tiếp tục từ handoff".
---

# Handoff for the next session

A handoff is a **claim sheet**: every line says what is true, and what proves it.
The reader trusts it only as far as that proof, so state the proof or mark the
line unverified. This is the in-repo handoff; the global `/handoff` writes an
English file to `/tmp` and is not a substitute.

Runs in the main session — the handoff file and the memory dir are the writes
the main session is allowed. The main session also holds the live handoff;
`doc-keeper` only retires old ones (last section).

## 1 · Gather the facts, do not recall them

```bash
git branch --show-current
git status --short
git log origin/master..HEAD --format='%h %s' | head
git worktree list
```

A fact enters the file only as one of four states, each with its proof:

| State          | Proof to write beside it                                            |
| -------------- | ------------------------------------------------------------------- |
| **built**      | what ran green: `pnpm check` on which branch                        |
| **committed**  | short hash; pushed or local only                                    |
| **shipped**    | Fly version, Neon migration number, `/healthz` — or "chưa ship"     |
| **never seen** | screens and mails nobody opened in a browser or `pnpm mail:preview` |

_Never seen_ is the line that earns the file: a green `check` says nothing about
laws 12–13, tablet targets or a mail, and the next session will assume otherwise.
Sums `pnpm ctx` or `pnpm lint:debt` can compute stay out ("Không con số chết");
write the command instead.

## 2 · Write `.claude/HANDOFF-<slug>.md`

`<slug>` is kebab-case English, one per body of work. Existing slug: update in
place. Body in Vietnamese (CLAUDE.md language rule); identifiers, paths and
commands stay as they are. Take the shape from `.claude/HANDOFF-assistant-wave-4.md`
— read it before writing:

```md
# Bàn giao · <việc> — <trạng thái một câu>

Viết <dd/mm/yyyy>. Nhánh `<tên>` ở worktree `<đường dẫn>` (đi từ `<hash>`).
Chưa push / chưa merge / chưa ship — nói rõ cái nào.

## 0 · Trạng thái

## 1 · Đã dựng gì

## 2 · Trước khi ship — hỏi chủ dự án

## 3 · Giới hạn đã biết

## 4 · Bẫy
```

- **§0** alone lets a cold session act: the four states above, plus the next
  concrete step. Locked owner decisions go here verbatim, marked "không mở lại".
- **§2** is the pre-ship list, in order: what to look at first (laws 12–13, the
  mail preview), migration order against other branches, the `/ship` order
  (migrate, then deploy), what to read on Fly after the deploy.
- **§3** known limits, each with the ADR that records it.
- **§4** traps hit this session, each a command or a symptom the next session
  would otherwise rediscover.
- Add `## Việc tiếp theo` (ordered) and `## Câu hỏi còn mở` when they exist.
- Point at ADRs, `docs/status.md` and commits by path or hash; the file adds
  only what none of them holds.
- No secrets, tokens or personal data; relative dates become `dd/mm`.

## 3 · Memory pointer

In the auto-memory directory the session context names (it differs between
WSL and macOS, so take it from there), one file `<slug>-handoff.md`:

```md
---
name: <slug>-handoff
description: '<what is built/shipped, in one line, with dd/mm>'
metadata:
  node_type: memory
  type: project
---

<scope in one paragraph>. **Why:** <what the next session would get wrong
without it>. **How to apply:** read `.claude/HANDOFF-<slug>.md` §0 first; <the
one check before acting>.
```

Then one line in `MEMORY.md`, replacing the old line when the slug exists:
`- [Title](<slug>-handoff.md) — <hook, under 200 characters>`.

## 4 · Resume

Read the file and its memory entry, then **re-check every claim** against
`git log`, `git status` and `git worktree list` before acting: the commit may be
merged, the worktree gone, a parallel session on the branch. Report current
status, the first next step, and any line that no longer holds; edit the file
when something moved.

## 5 · Retire

Once the work is shipped and nothing in §2–§3 is open, ask `doc-keeper` to move
what is still owed into `docs/status.md` and the ADRs, delete the handoff, and
drop its memory line.

Done when `pnpm ctx --strict` passes (every path the file names is real), and the
report is the path plus three lines: state, next step, the never-seen list.
