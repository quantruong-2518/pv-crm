---
name: scan-module
description: Map one pv-crm module across web, contract, API and docs through one Explore agent, returning at most 300 words so the main context stays clean. Use before touching a module not yet read this session, before /cut or /split, and on "module X nằm ở đâu" / "quét module".
---

# Map a module without reading it

A module in pv-crm is spread over five zones, so reading it by hand costs more
than the work it prepares. Send **one** `Explore` agent (`very thorough`, since
the names do not line up across zones) and keep the main thread free of file
dumps. Do not read the module's files before the agent returns.

`$ARGUMENTS` is the module name as the owner says it (`lead`, `campaign`,
`contract`, `assistant`).

## The brief

Fill `{module}` and send as the agent's prompt:

```
Map the `{module}` module of pv-crm. Reply in at most 300 words, no code quoted,
no file dumps, in exactly these headings:

## Web
Route(s) in apps/web/src/routes.tsx; screen files in apps/web/src/pages
(including -parts and -model); components in apps/web/src/components; query
files in apps/web/src/data. For each query: does it still carry `load:`
(reads a frozen fixture) or not (reads the API)? Which fixture scenario
(sao-do / das-vina)?

## Contract
Files under packages/contracts/src that the module's endpoints use.

## API
Controllers, services, repositories under apps/api/src/branches/<branch>/{module}
or apps/api/src/platform; the *.schema.ts tables and the latest migration under
apps/api/drizzle that touches them; the permission each route demands.

## Docs
ADRs in docs/decisions that name this module (number and one-line title) and
its entry in docs/status.md: what is still owed.

## Gotchas
At most three: anything a newcomer would get wrong.
```

## After it returns

Relay the summary as it came. If the question was about **who may read what**,
hand the route list to `dataflow-tracer`; if it was about a cut-over, the
`load:` list is the input to `/cut`. For the repo-wide numbers (comment share,
debt, broken references) run `pnpm ctx` instead — they are computed, not
mapped.

Done when the summary names all five headings and every path in it is real; an
empty heading means the module has nothing in that zone, and the summary says so.

## Not for

A single file ("what does `leads.tsx` do") — read it. A module already described
in a zone's `CLAUDE.md` (`apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`) — read that
section.
