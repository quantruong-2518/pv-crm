---
name: cat-mock
description: Cut one pv-crm query off its fixture and onto a real endpoint — a complete pass from the zod contract, through the route on apps/api, to dropping `load:` from the query. Use when asked to "làm endpoint X", "cắt màn Y sang máy chủ", "bỏ mock cho Z", or when a screen still reads frozen numbers where it should be reading Neon.
---

# Cutting one pass of mock data

`load:` **is** the marker, by the ritual written at the top of
`apps/web/src/app/api/client.ts`: a query with `load` still reads a fixture, a
query without it goes over real HTTP. There is no other flag. **Dropping `load`
from a query IS the ritual that cuts it over.**

**One pass = one query.** Do not batch two because they share a file.

## Hard rules

- **Dropping `load:` before the endpoint exists leaves a blank dead screen.** The
  endpoint goes up first, always.
- **Do not add tests.** The single exception is still a hard rule: adding a new
  number to a fixture requires a test locking that number right beside the fixture.
- **A number differing between a cut screen and an uncut one is by design, not a
  bug** — cut screens count against Neon, uncut ones against the frozen book.
  Report the numbers; do not "reconcile" them.
- The API `.env` points at **Neon production**. `db:seed` and `db:push` are
  forbidden. `db:migrate` is allowed if the SQL file contains no `DROP`.

## Step 1 · Pick, then verify it again

The queue is in `docs/fix-later.md` §3 — a table of query · file · route. **That
table can lag the code**: check it by eye before trusting it.

```bash
grep -rn "load:" apps/web/src/data          # the current truth
ls apps/api/src/branches/sales              # which domains already have a module
ls packages/contracts/src/sales             # which contracts already exist
```

Any row in the table that `grep` no longer finds a `load:` for is already cut —
remove it from the table.

## Step 2 · Learn what the query is asking

Delegate to `dataflow-tracer`. Four things must come back: **`need` (the permission
the query demands)** · **the return type** · **which fixture `load` reads today** ·
**the three permission axes it touches** (license `Actor.branches` · role `roleId`
→ `ROLE_PERMISSIONS` · scope `ownOnly`).

The three axes are **not substitutes**. Hiding a button is not a permission —
permissions live on the data path.

## Step 3 · The zod contract first, imported by both ends

Delegate to `contract-drafter`. Files go in `packages/contracts/src/sales/`, and
get exported from that directory's `index.ts`.

Three schemas per endpoint, plainly named: `*Params`/`*Query` (client-sent —
**untrusted, parse rather than cast**) · `*Body` · `*Response` (the frontend parses
this too). TS types are **inferred** from zod via `z.infer`, never written by hand
alongside.

## Step 4 · The route on `apps/api`

One domain is one directory under `apps/api/src/branches/sales/<domain>/`,
following the existing shape: `*.module.ts` · `*.service.ts` · `*.repository.ts` ·
`*.mapper.ts` · `*.schema.ts` (Drizzle) · `*.constraints.ts`.

**A controller is not always present.** The working rule: when the scope axis is
already on the path itself (`/sales/leads/:code/meetings`), the routes live on the
owning controller and this module only `exports` its service. A separate controller
would have to read the data before knowing whose scope to cut it by — **deciding
permission after reading is the wrong order**.

New tables mean a migration SQL file under `apps/api/drizzle/`, then `db:migrate`.
**Read the SQL and confirm there is no `DROP` before running it.**

## Step 5 · Drop `load:`

Delete exactly that `load:` line from the `queryOptions` — leave `queryKey` and
`need` alone. If the file's docblock claims it still has `load:`, update it to
match; the existing shape is in `data/mas.ts` and `data/meetings.ts`, a short block
stating that the query is cut over and why.

Leave the fixture behind it **in place** unless nothing imports it any more —
`rule-locator` can tell you what still uses it.

## Step 6 · Look at it, then close the pass

```bash
pnpm dev        # run_in_background — see /wsl, never nohup
```

The screen must show numbers. A browser error `does not provide an export named X`
while `typecheck` is green is **the Vite cache**, not a bug — see `/wsl`. It shows
up especially on this pass, because step 3 just touched the `packages/contracts`
barrel file.

## Step 7 · Close the books

- Remove the row just cut from the `docs/fix-later.md` §3 table and add a dated
  line to the "already dropped" note — that is what keeps the table from lying to
  the next pass.
- Run `/preflight`. This pass touched `packages/contracts`, a **shared layer**, so
  it must reach tier 2; stopping at `check:fast` is not enough.
