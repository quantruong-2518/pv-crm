# 0104 · Client cache tiers, and records-changed signals pushed over the notification stream

Status: accepted
Source: project owner's decisions, 19/10/2026; shipped 20/10/2026 (Neon 0126,
Fly v160, master `8ae8d19`); amended 20/10 after the architecture and performance
review (findings 2 and 3)

## Context

Until 19/10/2026 the web TanStack Query client still ran with the
frozen-fixture default: `staleTime`/`gcTime` `Infinity`, no refetch. Most
screens now read Neon through `apps/api`, so a colleague's change never showed
until a reload, and every revisit was served from a cache with no age.

## Decision

### 1 · Cache tiers in `apps/web/src/app/query-client.ts`

| Tier                  | Fresh / gc      | For                                                 |
| --------------------- | --------------- | --------------------------------------------------- |
| default               | 30 s / 5 min    | books, profiles                                     |
| `cacheTier.reference` | 10 min / 30 min | catalogs, labels, users directory, roles, templates |
| `cacheTier.aggregate` | 60 s            | scorecards, KPI, home figures                       |
| `cacheTier.live(ms)`  | caller's `ms`   | polled reads                                        |

- Signed-URL queries keep `gcTime` = `staleTime`, so an expired link is never
  shown.
- Audited content reads (thread messages, comm record, workstream comm
  records) stay `staleTime: Infinity`: each read writes an audit line.
- Focus/reconnect refetch and every poll run only while the session is live
  (`whileLive`).
- Writes in the tab still invalidate their own keys at once.

### 2 · Books keep the previous page only under the same filters

`keepPageUnderSameFilters` in `apps/web/src/app/book-query.ts`. Under new
filters old rows would sit under new chips, and the old total would bounce a
valid `?page=`.

### 3 · Intent prefetch and route loaders

- Book rows prefetch the profile query and route chunk on a 150 ms mouse rest
  or `pointerdown` (`apps/web/src/components/row-intent.ts`).
- Route loaders (`apps/web/src/app/route-warm.ts`, `warm` on `SCREENS` in
  `routes.tsx`) start a screen's chunk and main read together after boot,
  through the same access gate as `RequireAccess`, so a refused screen still
  downloads nothing.

### 4 · Push: the kind of record that changed, over the existing stream

- Postgres row-level triggers call `pg_notify('pv_change', kind)` (migration
  0126; `AFTER INSERT/DELETE` and `AFTER UPDATE WHEN OLD IS DISTINCT FROM NEW`).
  Postgres de-dupes per transaction, so a bulk import is one signal.
  High-churn and internal tables are excluded.
- The API's single LISTEN client (already used for the bell) also listens on
  `pv_change` and fans the kind out to every connected SSE stream as
  `event: entity`, coalesced to at most 1/s.
- **Kind only, never a record code.** Every user hears it, and a code would
  reveal a record outside the hearer's scope. The browser drops that kind's
  cached reads and re-asks the permission-checked GETs.
- Polls that push now covers (badges, comm queue, mail sending progress, scan
  progress) run only while the stream is down. A
  `ready` after reconnect triggers one catch-up invalidation.

### 5 · Rejected

- **Redis**: Postgres NOTIFY already crosses Fly machines; another service to
  pay for and guard.
- **Persisting the query cache** to localStorage/IndexedDB: scoped data on
  shared machines.
- **Caching grants/sessions server-side**: role edits must apply on the next
  request (see `users.service.ts`).
- **Server-side caching of aggregates, for now**: it would break
  read-your-writes unless busted on every machine, and Neon bills compute
  time, not query count. Instead the API logs requests slower than 300 ms
  (`apps/api/src/main.ts`) and caching is decided on those numbers.
- **`Access-Control-Max-Age` as the preflight fix**: browsers cache preflights
  per URL. GETs dropped the custom `X-PV-Request-Id` header instead, so they
  are CORS simple requests; the server falls back to Fastify's request id for
  `traceId`.

### 6 · Amendment 20/10: what push cannot cover

- **A read whose answer moves with the clock keeps its clock.** Push fires on
  row writes; a meeting ending or a day turning writes no row. Today's meeting
  bar polls every minute while the session lives, stream or not.
- **Aggregates follow business writes, throttled.** KPI and home figures are
  computed from lead, opportunity, contract, meeting, comm and approval rows.
  An event of those kinds schedules one sweep of `['sales','kpi']` and
  `['sales','performance']` 60–75 s later (jittered per tab), not one per
  event. A `kpi` event (targets) still sweeps at once.
- Not done: an aggregate poll while the stream is down. Aggregates never
  polled before this ADR; focus and remount still refresh them.

## Consequences

- A colleague's catalog change shows up to 10 min late (same-tab approvals
  still sweep); KPI and home figures up to 75 s late.
- Own writes cause one extra refetch, via the echo.
- Every write of a kind wakes the active screens of that kind for all users.
  Acceptable at current headcount; revisit with codes plus per-scope routing
  if it grows.
- The LISTEN connection still closes 30 s after the last viewer leaves (Neon).
- Ship order: migrate 0126 before deploying the API; ship the API before
  pushing web.
