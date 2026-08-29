---
name: dispatch
description: Decide who does what in pv-crm — which agent, which model, which effort, and what must be pushed to a subagent so the main context does not bloat. Read when starting a multi-step task, when about to open several files to find one thing, or when weighing doing it yourself against delegating.
---

# Routing work

Two questions, in order: **does this require reading widely?** then **how much
judgement does it need?**

## Rule one · Reading widely never happens in the main context

This repo is **28% Vietnamese comments**. Opening a file in `data/` or `pages/`
directly loads several hundred lines of docblock to reach one declaration — and
those lines stay in the main context for the rest of the session.

- Need to **locate** something (which file, which function, declared where) →
  `Explore`; take back paths and a conclusion, never a file dump.
- Need to **read a place you already know** → `Grep` for the declaration skeleton
  first (`^export`, `queryOptions(`, `@Controller`), then `Read` the exact line
  range with `offset`/`limit`.
- **Do not** `Read` a whole file "just to be sure".

## Rule two · Mechanical work does not run on Opus

The four agents in `.claude/agents/` already declare `model:` and `effort:` in
their frontmatter — calling one by name gets the right model, no override needed.

| Work                                                       | Who                | Model · effort      |
| ---------------------------------------------------------- | ------------------ | ------------------- |
| Locate files, scan for names, count usages                 | `Explore`          | haiku · low         |
| Wide scan needing judgement (is this the same rule twice?) | `Explore`          | sonnet · medium     |
| Trace data paths, audit permission holes                   | `dataflow-tracer`  | sonnet · high       |
| Write zod for a new endpoint                               | `contract-drafter` | sonnet · medium     |
| Classify rules in `data/`                                  | `rule-locator`     | sonnet · medium     |
| Deploy Fly + Neon                                          | `deploy-guardian`  | opus · high         |
| Build screens, change architecture, hard debugging         | main context       | opus                |
| Commit, preflight, cleanup                                 | main context       | whatever is running |

**Move up to Opus when:** the work touches production (Neon, Fly, migrations) ·
it changes a package boundary · getting it wrong fails silently rather than red
(permissions, money, record state).

**Move down to Haiku when:** the answer is a list of paths or a number.

## Rule three · Subagents always start fresh, so pack the whole brief

A subagent **cannot see** this conversation. The prompt must stand alone: what the
work is, which files to read first, what **shape** to return (table · list ·
paths), and what counts as done.

Three things always need restating because it cannot know them:

- Which data scenario (`sao-do` = already bought · `das-vina` = not yet) — **one
  screen uses exactly one scenario, never mixed**.
- Package boundaries: `@pv/ui` knows nothing of engines · `@pv/engines` does not
  depend on React.
- Commands must go through WSL (`/wsl`) — a subagent walks into the same `$(...)`
  trap.

Launch independent agents **in a single turn** so they run in parallel.

## Rule four · Do not delegate what you should just do

Delegating costs a context-loading round trip. Not worth it when:

- the work touches **one file whose path you already know**;
- the work is exactly what the user just described;
- the result needs **further conversation** — an agent returns once and asking it
  again is not cheap.

## Common shortcuts

The left column is what the user actually says, in their words.

| The user says                               | Go straight to                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| "thêm endpoint X"                           | `/cat-mock` if X still has `load:`, otherwise `contract-drafter` → `apps/api/src/branches/` |
| "màn này lấy số ở đâu"                      | `dataflow-tracer`                                                                           |
| "deploy BE" · "đẩy lên production"          | `deploy-guardian`                                                                           |
| "chạy check" · "commit đi"                  | `/preflight`                                                                                |
| "chạy app lên xem"                          | `/wsl`, the dev-server section                                                              |
| "sao trình duyệt báo lỗi mà typecheck xanh" | `/wsl`, the Vite cache section — do not read the code                                       |
