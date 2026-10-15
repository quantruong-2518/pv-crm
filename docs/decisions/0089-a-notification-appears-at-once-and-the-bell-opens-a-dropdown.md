# 0089 · A notification appears at once, and the bell opens a dropdown again

Status: accepted (supersedes 0085 §5 and the "Push delivery" line of "Not in wave 1"; amends 0085 §7)
Source: owner decisions 12/10/2026 — "A notification that fires must show up right away — ordinary notifications and system ones alike" and "When the notifications load with the header, always preload the first page and show a dropdown like the one behind the avatar; pressing 'see more' then goes to the full notifications page"

## Context

ADR 0085 §5 delivered the bell by refetching every 60 seconds and on window
focus, and rejected push because a standing connection is compute that never
sleeps (0010 #2). Commit 57739d3 then sent the bell straight to `/notifications`
and removed the first wave's drawer. The owner wants neither the wait nor the
extra step.

## Decision

### 1 · Push is the main road

A change to a person's notification ledger reaches their open browser at once,
for every writer: a request in the API, the worker process, a sweeper. The 60
second refetch stays only as the fallback while the stream is not live; refetch
on window focus stays.

### 2 · The signal is the whole message

The stream carries no rows. It tells the page that something changed for this
person, and the page re-reads the existing endpoints. The permission cut and the
row mapping stay in one place.

### 3 · The bus is the database

Postgres announces each change to `platform.notification` from a trigger, not
from application code. NOTIFY is delivered only on commit, so a fact that rolls
back rings nobody; and no future writer has to remember a call, which is what
makes "system notifications too" true. Read-state changes announce too, so a
person's other tabs drop the unread badge.

The API holds one dedicated listening connection, opened on the first
subscriber, on the same direct endpoint the queue uses (0010; the pooler drops
LISTEN). The stream is plain HTTP with the session cookie of its sibling
endpoints; the server ends each stream after a fixed age so the session is
re-checked when the browser reconnects. The connection closes 30 seconds after
the last subscriber leaves, because Neon is on the lowest plan and an idle
LISTEN keeps compute awake.

### 4 · The bell opens a dropdown

The bell opens a panel under it, the same shell as the avatar menu. It shows the
first page only, preloaded with the header, and ends in "Xem tất cả", which
goes to `/notifications`. This is not the first wave's drawer. The full page is
unchanged.

## What this supersedes

- **0085 §5** — "No SSE, no websocket, no push", and the "Push delivery" line
  under "Not in wave 1". The 60 second refetch it described is now the fallback
  only.
- **0085 §7**, one sentence — "a press on the bell goes there, and the drawer of
  the first wave is gone". The rest of §7 stands.
- The "Push (SSE / websocket)" row of 0085's rejected alternatives, on the same
  ground: the owner prefers immediacy to a connection that can sleep.

## Alternatives rejected

| Alternative                       | Why not                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------- |
| WebSocket                         | A one-way signal needs no duplex; SSE rides plain HTTP, cookies and existing CORS |
| The row itself over the stream    | A second place for the permission cut and the row mapping                         |
| `pg_notify` from application code | Forgettable, and the worker is a separate process                                 |
| Poll every 10–15 seconds          | Still not immediate, and more load                                                |
| Web push / service worker         | Out of scope                                                                      |

## Consequences and known limits

- Push exists only where a LISTEN can be trusted: PGlite, or
  `PV_QUEUE_DATABASE_URL` set (the rule the queue's `useListenNotify` follows in
  `boss.provider.ts`). Without it `GET /notifications/stream` answers 503, the
  browser's stream closes, the web keeps the fallback refetch and asks again,
  waiting longer after each refusal (ADR 0093, Consequences). A 401 renews the
  session once and reconnects at once; a failed renewal stops asking.
- `ready` is a promise that the line is listening: a stream says it only while
  the listener is up. When the LISTEN connection is lost every open stream is
  closed, browsers fall back to refetching and reconnect, and the new stream
  stays quiet until the listener is back.
- A stream also says `ready` only after the line checked that migration 0103's
  two triggers exist and a probe NOTIFY sent from the app pool came back within
  5 seconds. Otherwise browsers stay on the 60 second poll.
- Only a visible tab holds a stream; a hidden tab closes it and catches up on
  `ready` when shown again. One person may hold a bounded number of streams and
  the oldest is dropped past it. Open streams are closed before the HTTP server
  shuts down, so a deploy does not hang.
- Each stream counts as one in-flight request against Fly's
  `[http_service.concurrency]` limits, which were raised in `fly.toml` in the
  same change; at the old limits the streams alone would have filled a machine.
- The fixed numbers are engineering defaults the owner has not confirmed:
  heartbeat, maximum stream age and coalescing window (constants in
  `notification.stream.ts`); per-person stream cap and reconnect backoff
  (constants in `notification.listener.ts`); grace and client retry interval
  (constants in `apps/web/src/data/notification-stream.ts`).
- A revoked session keeps its open stream until the maximum age ends it; it only
  receives signals, never rows.
- The listening connection is a standing connection, the cost 0085 rejected
  push for. Its effect on Neon compute that would otherwise sleep is not
  measured here.
- Verified 12/10/2026 on a local PGlite run in a real browser, through the Vite
  proxy: the stream opened, an access change made by another account refreshed
  the count and the list with no reload, and the dropdown rendered. NOT
  verified: the Neon direct endpoint, Fly's proxy, and a cross-origin
  EventSource with the production cookie.

## Rollout

Precondition: `PV_QUEUE_DATABASE_URL` (the direct endpoint) must be set on the API process, or production has no push.

Migration `0103` → API → web. An old API has no stream route and the web falls
back to refetching, and the API without migration 0103 degrades to polling
rather than going silent, so any order is safe, but only because of the `ready`
check above; push works only once all three are live.
