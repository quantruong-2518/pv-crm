---
name: preflight
description: The gate before committing in pv-crm — three tiers of checking, stopping at the tier that is enough instead of always running the full gate. Use when about to commit, push, or open a PR, when asked "chạy check đi" or "xong chưa", and after touching shared layers (tokens · the @pv/ui API · eslint.config.js · packages/contracts). Also use when the working tree looks like another Claude session is editing it in parallel.
---

# Preflight — checking before a commit

Every command here runs through WSL. Invocation and the `$(...)` trap: `/wsl`.

What already guards: the `on-edit.mjs` hook (prettier + eslint after every write) ·
lint-staged at pre-commit · CI running `pnpm check`. This skill fills the gap
between "a file was just written" and "CI is red".

## Tier 0 · Who else is editing this tree — ALWAYS run, cheapest

**The `pv-crm` working tree may be under edit by another Claude Code session right
now.** This is not a hypothetical: on 19/08 another session built all of module 2
while this one rebuilt the Campaign screen; on 28/08 a session renamed a file out
from under another and 443 lines were lost to an `rm`; on 29/08 a session
committed the entire tree, including a migration the project owner had asked to
leave alone.

```bash
git status --short
git diff HEAD --stat
ls -la --time-style=+%H:%M <unfamiliar file>; date +%H:%M
git log --oneline -1 -- <unfamiliar file>
```

Read the output by four rules:

- **`git diff HEAD`, not `git diff`.** The index may be a commit behind (see tier 3)
  and `git diff` would then report things that are already committed.
- **An mtime newer than your own last Write = someone else's file.** Within ~10
  minutes of `date` means they are **still typing** and the file may be half
  written — leave it alone, do not stage it.
- **`--stat` showing more changed lines than you remember making** is the cheapest
  signal that a second session is at work.
- **Never `rm` or overwrite a file you did not create in THIS turn.** When in
  doubt `mv x x.bak` — that is reversible; `rm` is not (`git fsck` only recovers
  what once reached HEAD).

Leave tier 0 holding two lists: **your files** and **the other session's files**.

**If you have to wait for the other session, express the condition as a check, do
not ask the user to watch for you.** It usually is expressible: a marker file must
exist, a mount point must carry a module name, the tree must be quiet for N
minutes — then `run_in_background` a `while` loop sleeping 90 seconds a turn.

## Tier 1 · Fast check — the default

```bash
pnpm check:fast          # format:check + typecheck + lint; no test, no build
```

`test` and `build` are dropped — the two slowest steps, and during framework
building `test` says almost nothing (the repo deliberately has no UI tests,
`passWithNoTests`).

Red on `typecheck` means fix it. Red on `lint` with `aurora/spacing-scale` or
`aurora/comments-in-english`: check whether the file is already in
`eslint-suppressions.json` — **new violations are what turn CI red**, old debt is
already locked.

Stopping here is legitimate, **as long as you say which tier you stopped at** —
never report "verified" on the strength of `check:fast` alone.

## Tier 2 · The real check — before committing or pushing

```bash
pnpm check               # format:check · typecheck · lint · tokens · test · build · css
```

This tier is mandatory when:

- about to commit or push;
- the change touches a **shared layer** — `packages/tokens/globals.css`, the
  `@pv/ui` API, `packages/contracts`, `eslint.config.js`;
- the user asks for it.

**If the tree is dirty because of a parallel session, `pnpm check` on the tree does
not answer the question you need answered.** It checks someone else's work too. It
has to run against the **built commit** — see tier 3.

## Tier 3 · Committing while a parallel session is live

Commit only your own work; leave theirs untouched in the tree.

**Deliberately do not use `git commit`**: the `pre-commit` hook runs `lint-staged`,
which **stashes everything unstaged** — that is, it picks up the other session's
half-finished work and can lose it.

Write this as a `.sh` file and run it; do not send it as a one-liner — the whole
block is full of `$(...)`.

**1 · Snapshot your own files.** Put them under `/tmp/<this-turn's-prefix>/` and
**do not use the `pv-` prefix** — `/tmp/pv-msg2.txt` already belongs to the other
session. For files both sides touched (`fixtures/das-vina.ts`, `ui/index.ts`,
`kit/zone-atoms.tsx` are the three usual ones), split hunks: `git diff -U3 -- <file>`,
filter hunks with `awk`, `patch` them onto `git show HEAD:<file>`.

**2 · Re-check mtime IMMEDIATELY before staging**, not at the start of the turn.
Snapshotting a file someone is mid-edit on leaves HEAD red on `typecheck` with
errors that vanish on their own a few minutes later.

**3 · Stage straight from the snapshot**, never through the worktree:

```bash
blob=$(git hash-object -w /tmp/<prefix>/<f>)
git update-index --add --cacheinfo 100644,$blob,<f>
```

**4 · Commit with plumbing:**

```bash
TREE=$(git write-tree)
COMMIT=$(git commit-tree $TREE -p HEAD -F /tmp/<prefix>-msg.txt)
git update-ref refs/heads/develop $COMMIT
```

**5 · Repair the real index — the step people forget:**

```bash
git read-tree HEAD
git update-index --refresh
```

The plumbing flow never updates the real index, so after a few turns it falls a
whole commit behind: `git status` reports `D ` for exactly the files the previous
commit added — meaning the index is staging a **revert**, and any `git commit` the
other session runs will push that revert.

## Tier 3b · Check against the built commit

**This step is not ceremony — it is what FINDS the file that got mixed in.** On
23/08 it caught `routes.tsx`: the other session had added a route pointing at a
screen with no file yet, and in `git diff --stat` that file looked exactly like
one of ours.

```bash
git worktree add --detach /tmp/<prefix>-verify $COMMIT
# symlink the repo's node_modules in: root + apps/web + apps/api + packages/* + tools/eslint-plugin-aurora
pnpm check                      # run inside that worktree
git worktree remove --force /tmp/<prefix>-verify
```

Cheaper than `git archive`. This is the **only** way to know whether a commit will
be green in CI while the working tree is dirty. Do not trust a list of files you
believe to be clean.

## Finally

- Commit messages: Vietnamese, matching the voice already in `git log`.
- **Work that is finished but uncommitted is work sitting on a conveyor belt** —
  the other session may sweep the whole tree into their commit. Commit as soon as
  you are done; do not save it up.
- Anything deliberately kept out of the repo (an unapproved migration, a draft)
  must **not sit in the tree** — keep it in `/tmp`.
- Pushing to GitHub: see `/wsl`, "Pushing to GitHub". `origin` over HTTPS will hang.
