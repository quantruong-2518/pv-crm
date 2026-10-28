# 0127 · AI calls go through one gateway with a per-task route table

Status: accepted (amends 0102: the ledger row is written by the gateway in its own statement, not in the feature's transaction; amends 0066 §5: the scan model and daily token budget move from env to the route row)
Source: project owner's decision in session, 28/10/2026

## Context

0102 promised an orchestrator that picks the model per task from a routing
table, "decided, built later". Until now the one AI feature, the lead scan,
held a Gemini client of its own: the model in an env var, the daily budget in
another, retries and the ledger write inside the feature. A second feature, or
a second vendor, would have copied all of it.

## Decision

### 1 · One gateway, the only door to a model

Every AI feature calls `AiGateway` (`apps/api/src/platform/ai`); no feature
holds a vendor client. Per call the gateway reads the task's route, checks it,
sends to the primary model or its fallback, writes the ledger, and parses the
answer by the caller's zod schema. The JSON schema sent to the vendor is
derived from that same zod schema. Logs and errors carry model, vendor status
and reason, never prompt, answer or file bytes. A caller that accepted queued
work runs `check` at acceptance.

### 2 · The route table

`platform.ai_route`: one row per task (the same closed list as the ledger's
`task`), read on every call, not cached. Fields: primary model; optional
fallback model (different from the primary); input-token ceiling (optional);
output-token ceiling; timeout; calls per user per day; daily token budget
(`0` = no limit on either); `enabled`. The route is edited from the cost
screen's doors, both under `cost.view`, for the reason 0102 §3 gave for the
ledger. A migration seeds `lead-scan` with what the env vars held and never
overwrites a route an admin has edited.

The vendor is derived from the model name's prefix (`claude-` or `gemini-`),
so a route holds no separate provider column to disagree with the model. A
model whose vendor has no API key is skipped; no model left = the task is
unavailable.

### 3 · Attempt policy

A failure has one of four kinds, and the table is in `ai-policy.ts`:

| Kind         | What it is                                         | Next step                                                      |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------- |
| `transient`  | timeout, network, 408, 429, 5xx                    | the other model if there is one, else the caller retries later |
| `vendor`     | 401, 403, 404, a file type that vendor cannot take | the other model if there is one, else final                    |
| `bad-answer` | empty, cut short, not JSON, off-schema             | the same model once more, then final                           |
| `refused`    | any other 4xx, or input over the route's ceiling   | final at once                                                  |

`vendor` is split from `refused` because a wrong key or a mistyped model id is
our setup at one vendor, not the request: the fallback can still read the file.
Once any attempt in a call was transient, the call ends transient whatever
came after, so the caller's retry can reach the vendor that was down.

At most three attempts per call; the ledger's `attempt` column (1 to 3)
carries the same cap. The timeout is capped at 90 s so three attempts stay
under the scan queue's 300 s job expiry — past it pg-boss would deliver the
job again and the file would be billed twice. With SDK retries off, the scan
queue's own retries carry a vendor outage, so it delivers up to six times.
The input ceiling is checked with the vendor's free count endpoint: it writes
no ledger row and uses no attempt.

### 4 · Quotas

- Per user: first attempts only, so a retry or a fallback does not cost the
  user a call.
- Daily token budget: every attempt's tokens, failed ones too, because an
  unusable answer is still billed.
- Both are checked before the first attempt and refuse with "unavailable"
  (reason: disabled, no key, user limit, budget). Neither is checked again
  mid-call.
- Work the caller already admitted (a queued job, `admitted: true`) skips the
  quotas, so a batch accepted under the limit finishes, as 0066 §5 required.

### 5 · The gateway writes the ledger, one row per attempt, in its own statement

This amends 0102, which had the ledger row written with the feature's result.
The money is spent whether or not the caller's transaction later commits, and
with the gateway as the only writer no feature can forget to record. The cost
is that a rolled-back feature leaves its ledger rows behind, which is the
truth: the vendor billed them.

A failed ledger insert does not fail the call: the vendor has billed already,
and failing would make the caller retry and pay twice. The error log keeps the
model and token counts so the gap can be filled by hand.

### 5b · Latency, pausing a failing model, and per-vendor slots

Added with migration 0152, so tuning rests on numbers rather than guesses:

- Every ledger row carries `latency_ms`, the wall time of that attempt's vendor
  request. Rows from before 0152 are NULL.
- A model that fails three times in a row with `transient` or `vendor` is
  skipped for two minutes; any answer resets it, and one failure after the
  pause skips it again. With every model of a route paused the call fails at
  once as transient, so a queued job backs off instead of waiting out a timeout.
- At most four requests in flight to one vendor per process, so tasks added
  later cannot together hit the vendor's per-minute quota.

All three live in process memory: the api and each worker learn on their own
and a restart forgets. The numbers are starting values, to be tuned from
`latency_ms`.

### 6 · Configuration

`SCAN_GEMINI_MODEL` and `SCAN_DAILY_TOKEN_BUDGET` are removed; the route row
holds both. `ANTHROPIC_API_KEY` is added beside `GEMINI_API_KEY`. Anthropic
calls ask for the lowest effort and leave thinking adaptive, because the
current Sonnet and Opus models refuse thinking switched off.

## Consequences

- A new task is a new `AiTask` value, a widened CHECK on `ai_route` and
  `ai_call`, and a seed row; no new client, no new ledger.
- A new vendor is a new client and a new model prefix.
- Ship order: the migration before the API, because the new API reads the
  route on every call.

## Amendment 28/10/2026 (see 0130)

Every ledger row also carries `prompt_version`, the `id@version` of the prompt the call used.
