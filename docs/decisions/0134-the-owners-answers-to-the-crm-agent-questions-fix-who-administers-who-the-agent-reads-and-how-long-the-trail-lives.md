# 0134 · The owner's answers to the CRM Agent questions fix who administers whom, what the agent may read and show, and how long the read trail lives

Status: accepted (amends 0133: D1 peers and `>=` for locks, D2 phone and email, D4 what writes an `ai-read` line, §2 hidden items, §7 known limits)
Date: 2026-11-01
Source: project owner's answers in session, 01/11/2026, to open questions 141 to 153

## Context

ADR 0133 left questions 141 to 153 open and said which defaults the code took.
The owner answered all thirteen on 01/11. The owner also pulled 143, 144, 147
and 149 ahead of gate 0 ("làm xong luôn đi"), so they are built, and stay
unreachable: no route, no screen, routes off. Gate 0 is still OPEN; only a keyed
run on both vendors closes it. The eval has two new groups, scope-reach and
runner-summary.

## Decision

### 1 · Who administers whom (141, 152)

Only an admin locks, unlocks, resets a password or sends an invite. Admin is
whoever holds the `director` role, the top rank (`isAdmin` in e2-rank). Two
directors can act on each other. A head of sales keeps creating and editing
accounts, and `mayAdminister` `>=` stays for create and patch. Login backoff is
unchanged: 5 failures, wait up to 15 minutes, self-clearing.
Why: the owner's words: nobody locks another account except admin, or the
system on wrong behaviour such as failed logins.

`forgotPassword` stays silent for a never-activated account. A new hire who lost
the letter asks the director.
Why: otherwise a head could open an account on a mailbox they read and activate
it.

### 2 · Nobody gives wider scope than their own (151)

An own-only caller cannot widen `ownOnly`, must create own-only, and cannot add
a role or branch to a seat that stays whole-book.
Why: otherwise two people walk round the ceiling.

### 3 · The `ai-read` trail (142, 143, 144, 153)

- Rows are kept 12 months. A new permission `ai-read.view` goes to director and
  head of sales; the door is `GET /audit/ai-reads`; an own-only reader sees only
  their own lines. Why: account-executive holds `audit-log.view`, and this trail
  shows what each person looked up.
- The purge runs on the existing hourly notification sweeper in the worker, with
  no new timer. It is the one exception to audit being append-only.
- There is no web screen, on purpose. Why: a push reaches web before the API.
- lead-enrich and lead-scan write `ai-read` where the vendor call runs, not on
  the press. A retry writes another line. A scan writes one line per file read,
  a fill one per delivery, a summary fold one code-less line. Why: data left
  again each time. A line may exist when the gateway then refuses: the trail
  over-counts, never under-counts.
- Search hits still write lines, and opening a record writes one more. Dedupe is
  by (tool, code).

### 4 · What the agent shows (145, 146, 147, 148, 150)

- "Có N mục bạn không có quyền xem" appears only when reading books; search and
  profile answer as not found. Why: they deliberately never count hidden rows.
- Own-only figures are the same as the screen: room counts, money refused.
  Why: the agent must not show what the screen hides.
- Phone and email through the assistant always need `data.export`, checked on
  the live grant, even for one record. This reverses D2's "single-record read".
  Phone-shaped and email-shaped text in free text is masked `[withheld]` for
  non-holders (taxCode and website exempt), and `contactInfoWithheld` marks a
  `get_record` result. Why: the owner chose stricter than the question asked.
- The morning brief goes out on public holidays. A calendar can come when
  someone asks; before Tết is a sensible mark. Why: one rule is simpler than a
  calendar nobody asked for yet.
- A person already on a deal stays visible to its holder. Attaching is fenced by
  reach, so this mostly arises when a deal changes hands. Why: the holder must
  keep seeing who is on their deal.

### 5 · Compaction and the deep model (149)

- It runs in the background after a turn, never in a turn. Mark: 10 unsummarised
  whole turns or about 6,000 estimated tokens, to re-measure at the keyed run.
  Fold the oldest 4; the two newest always stay. Replay every unsummarised whole
  turn, ceiling 10. Dead turns never count.
- The summary holds what is asked, what was decided, record codes. The server
  drops any sentence holding a digit or `@`, drops codes not in the source, and
  clamps length. It stops figures in digits, not figures in words, which rest on
  the prompt.
- The summary re-enters inside a session-stable fence, so it is data and the
  prefix stays cacheable. Compare-and-set on `summary_through`.
- Route off means no fold, and turns older than 10 leave the model's view.
- `assistant-deep` stays Opus 5.5 with Sonnet 5.5 fallback until the keyed run,
  decided at wave 3.
  Why: a fold in a turn costs the person latency; digits in a summary would
  bypass the placeholder rule (0133 §3.2).

## Known limits

- Replayed answers are not re-checked when a permission is lost: a phone a
  holder saw can be re-sent for up to 10 turns, and needs refs per message at
  the chat route.
- Search still lets a non-holder confirm a phone typed in a company name.
- Masking is by shape: it can over-mask bank numbers or a tax code quoted in a
  note, and misses digits spelled in words.
- The summary and history can carry instruction-shaped prose; the fence and the
  prompt rule are the only guard.
- A pinned session keeps `assistant_tool_call.codes`, who read what, past the
  12 months of `ai-read` (open question 156).

## Consequences

- Migration 0160: the `ai-read.view` grant and a partial index on `audit(at)`
  for `ai-read`.
- Ship order: 0159, then 0160, on Neon before any API deploy from master.
  Without 0159 every AI ledger write breaks. Without 0160 the door answers 403
  to everyone and the hourly purge scans the audit table.
- Check the `platform.audit` row count at ship: a plain `CREATE INDEX` blocks
  audit writes during the build.
- New open questions 154 to 157.
