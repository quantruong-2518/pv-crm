# 0133 · The CRM Agent is one agent with tools over the door services, it reads until a card is pressed, and wave 0 builds the base

Status: accepted (amends 0130: `PromptSpec.fields` for chat has no returned fields; amended by 0134: owner's answers to questions 141 to 153; amended by 0136: D3 built, the chat opens to the director alone; amended by 0142 (company read))
Date: 2026-11-01
Source: project owner's decisions in session, 01/11/2026; the full plan is the Claude doc https://claude.ai/artifact/1r7zdgWt8CBWWCK52DCvCR (not copied here; when it and the 28/10 design differ, the doc is right)

## Context

PV One has no chat assistant: only a round Trợ lý button, switched off. The
owner wants one assistant staff ask, look things up with, and later have do
small jobs through a card a person presses. The 28/10 design left eight
questions; all eight closed on 01/11. The AI gateway so far makes one call per
request and has never run against a real provider.

Reading the original design against the code found three places where it could
not work as written (§ Corrections). Wave 0 is the base that makes the rest
safe to build.

## Decision

### 1 · Shape

One agent that calls a fixed catalogue of tools. Each tool wraps one service
that already serves a screen and runs as the person asking. It reads only. Any
write comes later as a proposal card, and the write runs when a person presses
the button (law 9). No model-written SQL, no web tool, no send tool.

### 2 · The owner's closed decisions (01/11)

| Topic                  | Decision                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Shape                  | One agent with many tools, not many agents                                                         |
| First version          | Read and answer only                                                                               |
| Order                  | Safe base, chat and lookup, proactive brief, figures, doing on request, memory                     |
| Provider               | Gemini primary, Claude fallback; the Gemini key is on a paid plan by the owner's word, not checked |
| Managers reading chats | No; counts and cost only                                                                           |
| Session retention      | 90 days from last open; a pinned session is kept until unpinned                                    |
| Pilot                  | The whole Sales department                                                                         |
| Wrong answer           | The user presses "Báo câu trả lời sai"; an admin reads that answer only                            |
| Cost ceiling           | No hard ceiling; tell the director when one person is at 3 times the average                       |
| Hidden items           | Say "Có N mục bạn không có quyền xem", show no content (narrowed to books by 0134 §4)              |
| Morning brief          | 08:00 Monday to Friday, Vietnam time, bell and email                                               |
| Brief email            | Counts and an open-CRM button; customer names stay on the bell                                     |
| Brief for a manager    | That person's own work only, subordinates not merged                                               |

### 3 · Corrections to the original design

**3.1 · Tools must pass each door's permission check.** The design said a tool
wraps a service and runs as the asker. But the permission axes 1 and 2 (the
need on the door and the scope of the role) are enforced only in `AccessGuard`,
on the HTTP door. A wrapper that calls the service directly skips both. So
every tool declares the door it stands for, the registry reads that door's need
at registration (a tool with none refuses to boot), and the check runs before
the tool does.

**3.2 · The number check cannot run after streaming.** The design said the
model writes the answer and the server checks it before sending. Text that
streams is already on the screen. So the model writes no digits or record
codes; it writes placeholders bound to paths in tool results, and the server
fills and formats them while streaming.

**3.3 · `E2.aiRead` is not the persistence path.** The design said every record
a tool returns passes through `E2.aiRead` and that function is wired to the
audit table. It is dead code that grows an array in memory, and its owner check
disagrees with the SQL. It is neither called nor changed; the audit write is
its own path (D4).

### 4 · Wave 0 decisions, each with the failure that forced it

**D1 · Escalation is closed before the agent reads anything.** `mayAdminister`
in the E2 rank module: the actor's highest rank is at least the highest of the
target's and of the roles being given. `>=`, not "outranks", so a sole director
can appoint a second. It guards create, patch, invite and reset-password for
users, and role replacement for roles; branches added must be among the
actor's own (the branch ceiling); a user cannot turn their own `ownOnly` from
on to off. For roles: nobody edits a role above their own rank, and added
permissions must be held, except at top rank, because nobody sits above it and
an unticked permission could otherwise never be given back. A promotion is
refused while the person has a temporary password, and an open invitation is
voided by a promotion, so a link a manager holds cannot open a raised account.
Why: a head of sales could raise themselves to director, and the agent reads
whatever the account may read, so a wrong root permission leaks through it.
Still open: `DEFAULT_PASSWORD` on peers and juniors; peers administering each
other (answered by 0134 §1); a sole director with mail off has no in-app recovery.

**D2 · A tool is a gate, not a function.** Each tool names its door; the
registry reads the need from it; a refused tool returns "not allowed" to the
model and calls no service. A tool names one door per record kind (`get_record`
stands for three), chosen after the input is parsed. 403 and 404 read the same
to the model. A tool takes the actor first and calls only door
methods that take the actor first, never sub-services. Input schemas are
strict and carry no actor or owner id. Platform cannot import branches, so
tools register through a token, as the comm-debrief hook does. Phone and email
come only from a single-record read, never from a list (reversed by 0134 §4: they
always need `data.export`). Wave 0 tools:
`search_records` and `get_record` (lead, opportunity, contract).
Why: see 3.1; and a model-supplied id is an identity the model could forge.

**D3 · Values are bound, not checked after.** See 3.2. Unknown ids are dropped
before the client sees them. Built in wave 1; wave 0 only streams text. If live
evals show a model cannot do this, reopen it in an ADR.
Why: "check then send" conflicts with streaming.

**D4 · The audit of what the AI read is written before the model sees it.**
One row per record, de-duplicated by code within a turn, action `ai-read`; a
tool with no records, or with hidden ones, gets one code-less row with counts;
nothing returned and nothing hidden writes nothing. A blocked call also writes
a refusal row, like `AccessGuard`. A read after a search hit in the same turn
writes no second line, since dedupe is by code; that is a neighbour of open
question 144 (answered by 0134 §3). The row holds no question,
argument, label or result. The write is awaited once per round, after tools
return and before results enter the next model request; a failed write stops
the turn and nothing reaches the model. No transaction is held across a model
call. The service's own `hidden` count is passed through.
Why: see 3.3; and an audit written after the answer is lost if the turn dies.

**D5 · Every string in a tool result is untrusted.** Inverted from the design:
a string is trusted only if its type is a whitelisted code, enum, id, date or
number. Results reach the model inside a per-turn random delimiter generated
after the data is read, and the prompt says text inside is data.
Why: public intake writes the company name and the AI fill writes web text into
legal name, address and more, so even labels are an attack surface. Wave 1
summaries and suggestion chips must not launder tool prose.

**D6 · Conversation mode lives in the gateway.** History across turns is plain
text. Vendor signatures and thinking blocks stay in memory for one turn and
never cross vendors. Each attempt is a ledger row (turn, round, cache tokens);
quotas are checked once per turn; the route is re-read each round and an off
route ends the turn; fallback is allowed only on round 1 before the first text;
bad tool input goes back to the model as an error, never a retry; the limiter
slot is held for one model call only; the timeout is the shorter of the route's
and the time left to the turn deadline; new routes have no input ceiling. The
answer reserve lives in the loop and is passed to the gateway. A round that has
started writing may use the reserve, and a stall still ends at the route limit
from the last word. A timer clipped by the turn deadline does not count against
the shared breaker. Queue wait ends at the deadline.
Why: the gateway made one call per request, and a vendor's replayed turn
carries signatures that break if filtered, reordered or sent to the other
vendor.

**D7 · Caps live in the agent loop, not in the gateway.** 8 rounds, the last
with tools off; a 60 s turn with no new tool round late in it; a cap on tool
result size, over which the result is dropped whole, with a note; a tool round
killed at the time mark goes on to a writing round from the results held; a cap on calls per round
and on parallel calls; if the writing round is refused or fails, a short fixed
sentence plus any partial text. The runner takes an event sink and is not tied
to a connection, so a closed socket does not abort it. 60 turns per hour per
person, counted from stored user messages. Heartbeats, the stream route and a
separate limiter pool are wave 1.
Why: the gateway must stay free of agent policy; a loop with no cap on rounds,
time or size is the cost and latency risk.

**D8 · Tables are additive, and a turn is one row.** Migration 0159: new
columns on `ai_call`; `ai_call` and `ai_route` task checks widened with
`assistant`, `assistant-deep`, `assistant-summary`, `assistant-brief`; platform
tables for session, message and tool call. `assistant_message.actor_id` cascades
with the session; `subject_kind` has a CHECK. The assistant message row is the
turn. Only one turn runs per session. A tool-call row has no output column, on
purpose: no tool result is stored. Starting a turn first marks stale running
rows as crashed. The four routes are seeded off.
Why: a crash must not leave a session stuck running; storing results would keep
stale copies of customer data.

**D9 · Contracts first.** The four task labels join `AI_TASK_LABEL`; a new
assistant contract holds the session and message shapes, the event union
(step, text, tool-result counts, done, error) and the strict tool input
schemas. The barrel export is a shared request.
Why: contracts are the single source of types for both ends.

**D10 · The eval harness runs without a key and cannot reach Neon.**
`pnpm ai:eval -- --suite assistant` is a new harness, selected on the first
line of `main()` before any file read; the lead suite is unchanged. It forces
in-memory PGlite and refuses any other scheme, uses the real door services, and
drives a scripted client that records every outbound request. It proves, with
no model: every tool by every role against in-scope and out-of-scope records
(canary strings on out-of-scope records appear in no request, delta, answer or
row), a hostile scripted model, and the runner's behaviour (caps, fallback
timing, route-off, ledger, one turn counted once, hidden pass-through, audit
before next request, failed audit stops the turn, stale row cleared). 50 cases:
20 scope, 15 injection, 10 off-topic, 5 lookup; safety cases repeat 3 times
under `--live`. The 150 in the plan is the wave 3 set. Model-graded checks run
only under `--live` and on a different vendor from the one tested. Scripted mode proved scope and runner
behaviour; the suite prints `gate 0: CLOSED` only after a live run on both
vendors in one invocation. No raw reported question goes under version control.
Why: the original harness reads gitignored real data, and a scripted run proves
scope but says nothing about a real model.

### 5 · Gate 0 is OPEN

Gate 0 closes only when live runs finish on both vendors. This machine has no
provider keys, so none has run. The harness prints `gate 0: OPEN` until then
and never prints pass from scripted runs alone. Nothing in wave 0 has a screen
or an HTTP route, nobody can use the agent, and the route seeds stay off.

### 6 · Amends 0130

0130's prompt spec has a per-field part (`PromptSpec.fields`). For the chat
prompt there are no returned fields, so that part is empty.

### 7 · Known limits

- Wave 0 has `hidden` null on all four doors.
- More limits from the owner's answers: 0134 Known limits.
- History replays past answers as plain text outside the delimiter, with one
  prompt rule only. _Superseded 10/11/2026: see the second amendment of ADR 0147._
- The model-facing findings for wave 1 live in the Claude doc.
- On ship, between migrate and API deploy, the old API's `GET /ai/routes`
  returns 500 because it cannot parse the four new task rows. Migrate-first is
  still right; the gap is short.

## Consequences

- Migration 0159. Ship order: migration before the API (0134 adds 0160 after it).
- Waves 1 to 5 each open only after the earlier gate passes; the plan doc holds
  the roadmap and the gates.
- Customer content going to Google and Anthropic still needs the cross-border
  assessment (open question 139).
- Open questions 141 to 153 hang on this decision; all answered by 0134.
