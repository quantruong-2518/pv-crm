# 0088 · The opportunity flow is closed end to end: who opens a deal, what a second deal needs, one win rate, pause, signed customers, leavers

Status: accepted (partially supersedes 0029's "no cancelling a signature",
0057 §1's contract update, 0067 §4's flagged-stop rule, 0071 §1, 0073 §1
import contacts, §2 renewal start and §4's refusal on an unheld lead, 0082 §2's
"no poller, no worker, no snapshot table" and two of its Consequences bullets;
amends 0082 §3 — exact paragraphs under "Superseded and amended")
Source: project owner's decisions in chat, 12/10/2026

## Context

The opportunity flow had gaps that each screen answered on its own: whether a
customer buying again is a new deal or a new contract, what "Tỷ lệ thắng"
divides by, who may open a deal, what happens to a deal nobody accepts, to a
postponed deal, to a signed contract that changes, and to the book of a person
who leaves. The owner ruled on all of them in one sitting. This record is the
decisions, not the implementation.

The section numbers below are the owner's item numbers, so a reference to
"0088 §9" is the ninth item of that sitting.

## Decision

### 1 · Buying more

Phases of one deal are signed as further contracts on the same opportunity. A
new need opens a new opportunity.

### 2 · A multi-phase deal

Unchanged from today: the first signature wins the deal and takes it off the
board; later phases are "Ký thêm hợp đồng". A "still signing" marker that kept
the deal on the board was considered and withdrawn the same day.

### 3 · No refuse door

No refuse door for now. Stopping at `new` stays the way a head declines.

### 4 · Two care lists

Two separate lists: the lead waiting group "Nhóm chờ chăm sóc" (not-yet-buyers)
and a new list of signed customers (post-sale care, where repeat deals are
opened).

### 5 · The waiting group

No deadline: a lead may stay forever. Leads carry labels a campaign can filter
on. Labels are their own config list, attached by hand, one or many — not the
park reason.

### 6 · A repeat deal

A repeat deal for a signed customer opens from the original lead. An
opportunity always has a lead.

### 7 · One win rate

"Tỷ lệ thắng" = won / (won + lost) by close date in the period — the KPI
definition (0082) — on every screen. The home tile that measures
leads-with-contract over leads-with-deal gets another name.

### 8 · Numbers are live, with a weekly capture

Numbers stay computed live. Added: an automatic capture every Sunday morning
and a manual capture button. Not a month-end freeze.

### 9 · A second running deal on one lead

Allowed, but the form lists the running deals and the user must confirm it is
a different need. The server blocks a double submit. File import follows the
same rule.

### 10 · Postponement

One pause list shared by all flows, with a proposed re-meet date and a
reminder half a month ahead to the people who need to know. The fallback is
the waiting group. A paused opportunity is kept — off the board, clock
stopped, not lost — and returns to its old column.

### 11 · Signed contracts

Add cancel and appendix (value up or down), both through director approval.
Nobody edits a signed contract directly.

### 12 · Who is responsible for a signed customer

On the signed-customer list the seller on the latest contract is responsible.
The head reassigns when they leave.

### 13 · A deal waiting at `new`

Bell to the head when it opens; when it goes overdue, bell again plus the
director. The deal does not move by itself.

### 14 · A leaver

Disabling a user account must ask who receives their leads, open deals and
signed customers. Past credit keeps the old name.

### 15 · Disabling a lead

Refused when the lead has a contract or an open deal. Otherwise it requires a
reason and writes a timeline row. Disable is for mistaken or junk leads.

### 16 · Who may open a deal

BD, Sale, account-executive, head-of-sales, director. Sale is new.

### 17 · Opening a deal on a lead nobody holds

The opener becomes the lead's holder.

### 18 · Deals opened by a head or director

Still accepted at birth, but left out of accept rate and accept lag.

### 19 · Opportunity file import

A lead-code column (the company name remains the fallback when it is blank),
plus contact and product columns, so an imported deal carries what the form
requires.

### 20 · Withdrawing a sign request

The raiser may withdraw a sign request before the director decides. Withdrawal
and rejection each leave a timeline row on the deal.

### 21 · "Đã liên hệ lần đầu"

Any real exchange: a confirmed call, a message, a mail sent, a meeting held. A
meeting not yet held does not count. Funnel and KPI share the definition.

### 22 · One live reasons chart

One live chart for the selected period replaces the fixture exits chart: lead
exit reasons and deal stop reasons by column. The opportunity book gets a
reason filter.

### 23 · Do-not-contact

Warn only: show the flag, and warn when such a lead is picked into a campaign.
No hard block.

## Assistant defaults and design — not owner decisions

The owner was told these and did not object. None is a ruling; each default is
a numbered question in `open-questions.md`.

- **account-executive still may not accept deals** (question 72). 0071 §3
  stands as written.
- **The unused permission `lead.convert` is removed** (question 73).
- **A lead exit reason may also carry the do-not-contact flag** (question 74).
- **Every opener becomes holder of an unheld lead** (question 75) — including
  head-of-sales, director and account-executive. An importer becomes holder of
  every unheld lead in the file, even when the row names other people on the
  deal. This is the assistant's default, awaiting the owner; it settles what
  §17 does for an opener whose role does not hold leads.
- **Import: a blank contact cell takes the lead's primary contact** (question
  76). The row errors only when the lead has none. Default, awaiting the owner.
- **Import: the contact-role cell accepts the role key or its Vietnamese
  label** (question 77). Default, awaiting the owner.
- **Import commit refuses the whole batch with 409 when a lead's running deals
  changed between the check and the write** (question 78). Default, awaiting
  the owner.
- **The reasons chart counts leads where they stand now** (question 79), not
  exit events: a lead that was disqualified and reopened in the period is not
  counted, and leads parked in the waiting group are not exits. Default,
  awaiting the owner.
- **A file row says "this is a different need" by being sent again with
  `acknowledgedDeals`** (question 80), equal to the running deals the preview
  showed. Default, awaiting the owner; it settles the §9 file-row question
  below.
- **The running deals of a lead are shown by code, name, stage and holder to
  whoever may open a deal on that lead** (question 81), even deals outside that
  reader's own deal scope. This overrides ADR 0071's deal scope for this one
  list, on the strength of ADR 0084 (every role sees lead code and holder).
  Default, awaiting the owner.
- **A Sale who opens a deal stands on the SALE lane as Sale chính, BD lane from
  the lead's BD** (question 82); an account-executive opener keeps the earlier
  prefill. Default, awaiting the owner; it settles the Sale-lane item below.
  Owner ruling 12/10: a Sale opener without the assign permission names nobody
  but themselves on the SALE lane; a BD opener still proposes the seller.
- **An own-only Sale may read the open form (contacts, running deals) of a
  lead nobody holds before claiming it** (question 83). Default, awaiting the
  owner.
- **Each imported deal rings the same bells a deal opened on the form rings**
  (ADR 0085: the acceptors, and the people on its lanes), so a large file rings
  once per deal (question 84). Default, awaiting the owner.
- **"Đã liên hệ lần đầu" on the home funnel counts a meeting only once it is
  marked held** (question 85), so meetings that happened before that mark
  existed stop counting. The lead book's score strip still counts by meeting
  rows and was not moved to the shared definition. Default, awaiting the owner.
- **`OPPORTUNITY_ACKNOWLEDGED_MAX` (200) is an input-size fence**, not a
  business threshold.
- **How the double submit of §9 is blocked** — the assistant's design. The
  create body carries the codes of the running deals the form displayed. The
  server compares them with the lead's actual running deals under the lead
  lock and answers 409 with the current list on a mismatch, so a repeated
  submit carries a stale list and is refused. No new column, no time
  threshold.

## Build scope as of 12/10/2026

**Waves 1–2, being built on branch `opp-flow-close`:** §7, §9, §16, §17, §18,
§19, §21, §22, and dropping `lead.convert`.

### Decided, not built

Everything else. §1, §2 and §3 keep today's rules and ask for nothing new. The
rest is decided and has no code:

- §10's pause reminder is not built yet. Of §13, the bell to the acceptors
  when a deal opens already rings (ADR 0085); ringing again at overdue and
  adding the director are not built.
- §8's scheduled capture must be weighed against the Neon compute quota
  (question 69) — the reason 0082 §2 refused a poller.
- §4, §5, §8, §10, §11, §12 and §14 need new tables.
- §6, §15, §20 and §23 are not started.

Until each is built, the superseded paragraphs below still describe what the
code does.

## Superseded and amended

- **0071 §1** — "Sale, presales and marketing may not." Sale may (§16);
  presales and marketing still may not.
- **0073 §4** — "403 for a lead not held": narrowed. A lead nobody holds is
  opened and taken by the opener (§17). A lead somebody else holds is not
  covered by this ruling.
- **0073 §1** — "The import door writes none" (contacts): the file carries
  contact and product columns (§19). The company-name match becomes the
  fallback behind a lead-code column.
- **0073 §2** — "Renewal and expansion … start from the account, not from the
  lead drawer": a repeat deal opens from the original lead (§6).
- **0082 §2** — "No poller, no worker, no snapshot table": compute on read
  stands; a weekly and a manual capture are added beside it (§8).
- **0082 §3 and §3a** — `opportunity-accept-rate` and `accept-lag-days` leave
  out deals opened by a head or director (§18); the first response of
  `first-response-hours` is the shared definition of §21.
- **0082 Consequences** — "The leaderboard and the workstream scorecard keep
  their own 'won'": any figure labelled "Tỷ lệ thắng" follows §7. And "The
  overview's exits donut now reads `frozenExitsQuery`": replaced by the live
  chart of §22.
- **0057 §1** — the paragraph under which an edit of a signed deal's amount,
  currency or main SALE owner updates the already-signed contract: a signed
  contract changes only through cancel or appendix, with director approval
  (§11).
- **0029** — "No cancelling a signature": cancel is in scope, as an approved
  proposal (§11). The reasoning of that bullet (undoing must be a proposal
  someone approves, not a direct call) is what §11 implements.
- **0067 §4** — "A stop with a flagged reason … is never put into a campaign
  and never mailed": warn only (§23). This also settles the "Do-not-contact
  enforcement" deferral in 0072, 0076 §5 and 0077: there is no enforcement
  turn, only the warning.

Confirmed, not changed: 0069 §5 and 0077 §2 (§1, §2), 0071 §6 (§3), 0068 §4's
"no automatic archive" (§5), 0071 §3's born-accepted deals (§18).

## Consequences

- §10 adds a place a deal can be that is neither on the board nor lost. 0069
  §1–§2 stay true for a stop — a stop is still final — but the stored state
  set they list no longer covers every deal once pause is built.
- §12 names a responsible person for a signed customer. 0084 says there is no
  owner of an account, only of a lead; §12 reads the person from the latest
  contract and does not add an account owner. What the list shows per customer
  is open (question 71).
- §9 reverses the import door's present refusal of any row whose lead already
  has a running deal. How a file states "this is a different need" is the
  default of question 80.
- §7 leaves the home tile without a name: the owner said it gets another one,
  not which.
- §15 against today's disable door: it takes no reason, writes no timeline
  row (the audit row is its only record), and is not refused when the lead has
  a contract or an open deal — it switches those off along with the lead.

### Shipping

- Deploy the API before the web: a web built without `lead.convert` cannot
  parse `/auth/me` from an API that still sends it.
- A data migration grants `sale` the open-deal permission on existing
  databases; it is the migration that follows 0101.
- Migrate and deploy together.

## Open

Not decided; each is a numbered question in `open-questions.md`:

- Who "the people who need to know" are, per flow, for the pause reminder
  (question 68).
- How the Sunday capture runs given the Neon quota (question 69).
- Whether closed periods read the capture or the live number (question 70).
- What the signed-customer list shows, and whether one customer with several
  leads appears once (question 71).
- The assistant defaults above (questions 72–85).

Not raised in chat, flagged rather than assumed:

- The workstream scorecard prints "Tỷ lệ thắng" over closed journeys, not over
  closed deals. Under §7 it is either re-based or renamed; the owner named
  only the home tile.
