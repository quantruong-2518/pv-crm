# 0069 · An opportunity stop is final; the lead loops, the journey follows

Status: accepted (partially supersedes 0064 §1/§2/§3/§6, 0067 D2, 0018
default 5 and 0023's one-contract-per-opportunity rule; defers 0022 — exact
paragraphs under "Superseded")
Source: project owner's decisions in chat, 29/09/2026
(`.claude/HANDOFF-opp-loop.md`, "Đã chốt 29/09/2026" and "Chốt thêm 29/09");
canvas https://claude.ai/artifact/GWVAqJSDxm87NwbgT6eGB5 (E-Model, E-Main,
E-Deal, E-Fall, row F)

## Context

0067 and 0068 settled the Presale phase of the repeating journey. The Sale
phase (the opportunity) still ran on 0064: a failed deal went to a care list
and could be reactivated in place, back to the stage it failed at. Three
sources disagreed on what a stop does: 0067 D2 (a separate stop record, no
lead), the canvas (a waiting lead, waking opens a new journey), and 0068 (the
lead loops in place, same code, journey and holder). A journey whose deals had
all gone to care never closed `LOST`, because `LOST` read only
`lead.disqualified`. And a won deal could sign exactly once.

## Decision

### 1 · Stopping an opportunity is final

A stopped opportunity is lost. There is no reactivate door and no in-place
return. Re-nurturing goes through the lead (§3).

Every stop writes a **fail log**: the rung it stood on, the reason, a note,
who concluded, when. The fail log lives on the opportunity row and its stage
event — there is no separate stop record for opportunities.

### 2 · State keys and labels

| Key    | Label            | Stored?                                       |
| ------ | ---------------- | --------------------------------------------- |
| `open` | "Đang chạy"      | stored (replaces "Đang triển khai")           |
| `lost` | "Đã dừng"        | stored (replaces `care` "Danh sách chăm sóc") |
| `won`  | "Thành hợp đồng" | derived from a contract row, as today         |

### 3 · The last stop parks the lead; the journey closes `LOST`

When the **last** live opportunity of a journey stops and nothing is signed,
the lead moves `converted` → `nurturing` ("Nhóm chờ chăm sóc"), holder kept
(0068 §4), and the journey closes `LOST`.

If other opportunities are still running, or something is signed, the lead
stays `converted`.

A journey is `LOST` when it has no contract and every opportunity is lost. It
is no longer read from `lead.disqualified`.

### 4 · Re-warming reopens the same journey

A lead parked this way is re-warmed under 0068 — a real touch, or the manual
resume. That reopens the **same** journey: same lead, same holder. New
opportunities sit beside the lost ones.

### 5 · A won opportunity can sign again

Each sign request carries its own amount, currency and contract kind
(licence · deployment · training), and the director approves it through E3
as the first time. The opportunity's own amount is untouched — no summing.
There is no `UNIQUE` on `contract.opportunity_code`.

0022 (the contract amount comes from the committed quote version) is deferred
until the quote object (`BG`) exists.

### 6 · Signing still closes the journey `WON`

Exactly as today, until the contract ladder (Postsale) exists. Removing that
rule belongs to the Postsale turn.

### 7 · A mail template may record a milestone

A template may carry one milestone, `sample` or `quotation`. A letter sent
from the opportunity door with such a template records that milestone when it
successfully leaves, under the same forward-only rules as the manual button
(0064 §3). POC is never recorded by mail.

### 8 · Sub-rungs shown this turn

- "Gửi lần n" — each `quotation-sent` touch.
- "Chờ duyệt ký" — the pending E3 `contract-sign` approval.

Discount approval waits for the `BG` object. POC sub-steps are not stored;
the next step (§10) carries them.

### 9 · A customer reply never moves a rung

A customer reply on an opportunity is recorded in its activity only. It never
moves a rung.

### 10 · Holder, handover, next step

> Refined by 0071: the holder is the first seller on the SALE lane, else the
> acceptor, else the first BD owner.

- The holder of an opportunity is the first SALE owner who is not
  `head-of-sales`. At convert it defaults to the lead's holder.
- A lead handover pre-ticks the open opportunities where the old holder
  stands as SALE.
- Next steps on opportunities use the same server table and the same
  three-level ladder as leads (0067 D11). Open steps are cleared when the
  opportunity stops or signs.

### 11 · Loss-reason catalogue

The catalogue stays the stage-scoped `LOSS_REASON` config list. It gains the
"Không liên hệ" (do-not-contact) flag and the any-rung reasons from canvas
board F-Wait.

### 12 · One activity stream

The activity of an opportunity is one stream: its touches and its stage
events together (flow E1). This reverses 0018 default 5, which no ADR had
recorded until now.

### 13 · Deferred

The in-app bell (flow H) is its own later turn, for every object. This turn
keeps the internal `opportunity-opened` / `opportunity-lost` mails.

## Superseded

- **0064 §1** — `care` as a stored `state`; "reactivation returns it to
  exactly this stage" (`care_from_stage`); `closed_at` "cleared on
  reactivation". **§2** — the `open` and `care` labels. **§3** — the `care` →
  `open` row (reactivate), and "A lead already `converted` is left as it is —
  NOT touched when its opportunity enters care" (§3 here). **§6** —
  "Reactivation returns the SAME opportunity to the stage it failed at".
- **0067 D2** — the separate stop record for opportunities ("The opportunity
  and contract stop doors are built with the Sale phase, on the same stop
  record"; "opportunity and contract later" in §4). Contract stops are not
  decided here.
- **0018 default 5** — "the two timelines are never merged", for the
  opportunity's own activity (§12).
- **0023** — the first invariant ("one opportunity has one contract") and
  `UNIQUE (opportunity_code)` on `sales.contract` (§5).
- **0022** — deferred, not retired, until `BG` exists (§5).

## Consequences

- `POST /:code/reactivate` and the "Mở lại" button go.
- A contract-kind catalogue and a `contract.kind` column are added; the sign
  door accepts an opportunity that is already won;
  `WorkstreamOpportunity.contractCode` becomes a list.
- `syncClosed` already reopens a closed journey; only its `LOST` condition
  changes (§3).
- The journey read (`apps/api/src/branches/sales/workstream/workstream-lanes.ts`)
  gains the §8 sub-rungs and opportunity next steps.
- Next steps for `OP-` get their door in
  `apps/api/src/branches/sales/next-step/`.
- A lead entering `nurturing` under §3 is an entry like any other, so 0068 §6
  (unsent mail withheld) applies.
- Before `/ship`: count the `LOSS_REASON` set and the opportunities in `care`
  on Neon (read only). Check `lead_email_live_idx` when a lead returns to
  `nurturing` after a `LOST` journey.

## Alternatives rejected

- Reactivating the same opportunity in place (0064 §3/§6) — the owner chose
  re-nurturing from the lead.
- Summing each contract's amount into the opportunity's amount.

## Open

- Contract stops and what a customer reply on a contract moves — Postsale;
  `open-questions.md` #27.
- Discount threshold — `open-questions.md` #6.
- Not raised in chat, flagged rather than assumed:
  - how a journey whose lead never converted (no opportunity) closes `LOST`,
    now that `LOST` no longer reads `lead.disqualified`;
  - whether the `care_*` columns and the `care-entered`/`care-left` touch
    kinds are renamed along with the state key;
  - what reason, if any, the lead's `nurturing` entry under §3 records (0068
    Open);
  - whether 0018 default 5 also changes on the lead profile;
  - 0018 default 3 (`OpportunityRow` carries one `contractCode`) once a deal
    has several contracts;
  - under 0023, how several contracts on one deal each point at a committed
    quote once `BG` exists.
