# 0131 · AI lead fill runs as a background job with a tray, and Undo lives on the finished job

Status: accepted (amends 0128 §1: the press no longer blocks and Undo is no longer a 10 s toast; amends 0130 §7 and §9)
Source: project owner's decisions in session, 28/10/2026 (slice A-2 of the retired AI handover; its open items are in `docs/status.md`)

## Context

0128's press awaited the model calls inside the HTTP request: the screen was
blocked until the fill finished, and the per-call cap on the `lead-enrich`
route was held at 30 s only as a temporary measure until a background tray
existed. With two calls per press (0130) the wait got longer, and Undo was a
toast that disappeared in 10 s, whichever page the person had moved to.

## Decision

### 1 · A press creates a job; the work runs in the background

`POST sales/leads/:code/ai-fill` checks what it checked before (lead exists,
in scope, has a company name and a contact, has an empty fillable field, quota
admits) and then only creates a job row, enqueues it and answers 202 with the
job. The two model calls and the write run in a worker. There is no synchronous
path left. A person who presses and leaves the page loses nothing.

Quota is checked at the press: the caller's calls in the last day plus 2 per
active job of theirs must stay under the route's daily limit. No new number.

One active job per lead: a second press while one is queued or running is
refused with the existing job's id, and the screen opens the tray instead.

### 2 · The job row and its states

`sales.lead_ai_job` (migration 0157). A job belongs to the person who pressed
and only that person sees it. States: `QUEUED`, `RUNNING`, `DONE`, `FAILED`.
The row carries the number of steps completed and the milliseconds each took,
so the tray draws progress from data, not from timers. A finished job keeps its
result (what was filled, conflicts, what was not found), which is what makes
Undo possible later. A failed job keeps a failure kind and one Vietnamese
sentence for the tray. Which fields exist and which states imply which columns
is the migration's CHECKs, not restated here.

### 3 · Five steps

Fixed keys, in order: `read-lead` · `web-search` · `tax-lookup` · `dup-check` ·
`write`. Labels on screen: "Đọc hồ sơ lead", "Tìm thông tin trên web", "Tra cứu
mã số thuế", "Kiểm trùng công ty", "Điền vào lead". `web-search` is the two
model calls of 0130 §2. Identify and the registry lookup run in parallel; a
step counts as done only when every earlier step in the canonical order is
done. A failed job shows the failing step, which is the one after the last
completed.

### 4 · The queue

Queue `lead.ai-fill`, payload the job id only, the same shape as the scan
queue. Retries with backoff for transient errors; on the final attempt the
handler writes `FAILED` itself, because pg-boss drops an error thrown on the
last attempt without a trace. The worker calls the gateway as already admitted
(the quota was checked at the press). A sweeper, ticking every 5 minutes, fails jobs stuck queued or
running past 25 minutes and deletes finished rows older than 24 h. Both values
are chosen, not derived. 25 minutes does not cover a third redelivery (3 × 600 s
of expiry). Queue options (expiry 600 s, retention, retry delay) live in
`platform/queue/boss.provider.ts`, as the scan's do.

A transient failure after the `web-search` step is final: the paid calls are
not re-run for free.

_Amendment 02/11/2026: the rule above no longer holds for a partial result. If one call fails transient and the other found at least one value, the job ends DONE and the busy call's fields are listed in `notFound`. It rethrows (and so retries) only when no call found anything, or on any non-transient error. The retry delay is now the breaker's pause (`PAUSE_MS`) and the expiry is 900 s, because a 10 s retry landed on a just-paused model; "expiry 600 s" above is stale. Known limits: the tray shows "not found" for fields of a call that was busy; a database-busy error beside a paid Read call is retried and pays Read again; two fills can now hold all four vendor slots shared with the lead scan._

### 5 · Signal and read

New SSE kind `ai-job`, raised by a trigger on the table. It is a signal only:
the web re-reads through `GET sales/ai-jobs`, which returns the caller's own
active jobs and finished ones not dismissed and under 24 h old. The stream
never carries rows, so a permission cannot leak through it (the 0126 rule).
While the stream is down and a job is active the web polls every 2 s, as the
lead scan does; 2 s is a chosen value.

### 6 · Undo is on the server and lives on the finished job

`POST sales/ai-jobs/:id/undo` empties each filled field whose stored value
**still equals what the AI wrote** and whose AI mark is still present, drops
the mark, and writes one touch and one audit row. A field the person edited
since is left alone, so Undo can never destroy human work. Contact fields
written through the contact writer are undone the same way. A job can be undone
once, and only when `DONE`.

Undo is offered only while the job is finished less than 24 h ago and not
dismissed (§7), not 10 s.

### 7 · Retention and dismissal

A finished job stays in the tray for 24 h, then drops out of the read. A person
dismisses one job or all finished jobs; dismissal is a flag on the row, not a
delete. Retry is another press.

### 8 · The tray and the button

The button becomes icon-only; while its lead has an active job it is tinted and
pressing it opens the tray. The tray is an organism in `@pv/ui`, mounted once at
the app root beside the toasts so it floats over every screen, hidden when
there are no jobs, collapsible to one pill. It sits under overlays (z 45) and
toasts stack above it. When a job turns `DONE` while that
lead's page is open, the page absorbs the filled values and plays the reveal as
before; the toast and its own "Hoàn tác" go away.

### 9 · Route timeout

Migration 0157 raises the `lead-enrich` route's `timeout_ms` from 30000 to
60000, only where it still holds 30000, so an admin's edit is never overwritten.
Nothing blocks a screen any more, so the 30 s reason is gone.

_Amendment 02/11/2026: the background web-search call hit 504 DEADLINE_EXCEEDED at 60 s, because the SDK sends the route timeout as the vendor's server deadline; the fallback failed too, on a vendor key problem the owner is fixing. Migration 0163 raises the route to 90 s, only where it still holds 60000, so an admin's edit stays. Migrate before or after the deploy; both are safe._

### 10 · Not in this slice

Bulk fill for sheet import and scan (the enricher keeps its public shape so a
bulk step can reuse it), and many contacts (A-3). Scan batches do not appear in
the tray.

## Consequences

- Ship order: migration 0157 before the API; the old API cannot serve the new
  web and the new API removes the synchronous path, so web and API ship together.
- Fill results are held for 24 h in a table, which holds customer values; they
  are the same values already written to the lead.
- A stuck job is failed by the sweeper after 25 minutes.
- Open questions 135–136 hang on this decision.
