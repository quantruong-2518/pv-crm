# Status

The one ledger. What is owed and what is next, by module. Nothing else lives
here: why a thing has its shape is in `decisions/`, questions the owner has to
answer are in `decisions/open-questions.md`.

Written 10/11/2026 from the retired handover files. Each entry was checked
against the code or `git log` on that date unless it says **not rechecked** —
then it is only what the handover reported, with the handover's date. No
commit hashes, deploy versions or counts here: `git log`, `pnpm ctx` and
`pnpm lint:debt` hold those.

## AI

- Cleanup migration owed, once the current API has run stable: drop
  `lead.category`, `account.category`, `lead.industries`, the two
  `lead_industries_*` CHECKs and the six `*_legacy_*_sync` triggers of 0154
  (ADR 0129 §7); drop `lead.headcount`, `account.headcount`, the two
  `*_legacy_size_province_sync` triggers and the three `sales.legacy_*`
  functions of 0156 (ADR 0130). 10/11: no migration through the latest one
  drops any of them.
- Route `comm-report` was left OFF on 01/11, waiting for the data-transfer
  dossier (open question 139); the AI button on a comm is hidden until
  `PUT /ai/routes/comm-report`. Production state **not rechecked**.
- ADR 0132 left undone: a long text file that was cut is still recorded as
  read; a signed customer gets no suggested step.
- `pnpm ai:eval` has no data: the set of about 20 real leads is waiting on the
  owner (01/11).
- Eye check owed (laws 12 and 13) on the screens added 28/10 to 01/11: AI
  fill, industry lists, comm report, size band. Never recorded as done.
- Column "Nhóm ngành" in the lead book does not fit 1440px; waiting for the
  owner to name the column to drop (01/11). **Not rechecked.**
- CRM Agent: gate 0 stays OPEN until live runs finish on both vendors:
  `pnpm ai:eval -- --suite assistant --live --yes --model <id>` with a key,
  once per vendor (ADR 0133 §5). Wave 1 (chat panel, `/assistant`) and ADR
  0137 are on master; the 01/11 handover said migration 0162 had to reach Neon
  before the API deploy — whether it did is **not recorded here**. Full plan:
  https://claude.ai/artifact/1r7zdgWt8CBWWCK52DCvCR
- Company profile door is unfenced (debt, found 10/11 by reading code; owner:
  fix in its own turn, not now). `GET /accounts/:code` (`profile` in
  `apps/api/src/branches/sales/account/account.controller.ts`) calls
  `AccountService.profile(code)` with no `Actor`, so anyone holding
  `account.view` — an own-only salesperson included — gets every lead
  (`leadRows`), every deal with its amount (`dealRows`), every contact with
  phone and email (`contactRows`) and `signedAmountVnd` / deal counts
  (`AccountProfile`, `packages/contracts/src/sales/account.ts`). The lead and
  deal profile doors do fence by scope, so the company screen shows what they
  refuse. The CRM assistant's company read does not wrap this door as-is: it
  takes company fields from it and re-reads child leads and deals through the
  lead and opportunity book doors as the asker.
- CRM assistant history read (ADR 0147), debt:
  - A turn's tool-token cap (`TOOL_TOKEN_CAP`,
    `apps/api/src/platform/assistant/assistant-loop.ts`) counts the whole turn
    and drops an over-cap result whole: a history read after other calls, or
    twenty max-length summaries in 3-byte script, returns nothing (fails
    closed). Candidate: the tool trims summaries to a budget and flags it.
  - The comms door audits a `view` line for every summary on the subject,
    including rows past the 20 shown and results the loop then drops as
    over-cap: over-counts, the safe direction. The comment in
    `assistant-loop.ts` near line 164 ("an over-cap result reaches neither the
    model nor the audit") is now untrue for door-side audits.
  - Built 10/11/2026 (second amendment of ADR 0147): reach re-check of a
    stored answer and the audit line on re-serve.
  - Replay and fold resend revealing answers to the vendor with no content
    `view` audit line. Owner to decide.
  - A `running` turn has no age limit in `detail`, so a stuck row skips the
    audit until the sweep.
  - `reveals` and `revealing` are two lists from one fact.
  - `DebriefService.reachable` duplicates `runInReach`'s predicate and has no
    direct test.
  - Gate 0 needs a live multi-turn case checking that the model never copies
    the fence into its answer.
  - Deploy window: migration 0165 backfills at migrate time and the old API
    keeps writing `false` until the new release is live; the UPDATE in 0165
    must be run once more after the deploy (mark this line done once it has
    run).
  - While an answer covered by a chat's folded summary stays shut for its
    owner, that chat no longer folds; past `REF_CHECKS` codes an answer counts
    as unchecked, so folding stops there too.
  - `revealsOf` reads the permission from the tool's current code; the row
    stores only a boolean.
  - The ref chip label falls back to the bare code when the comms door is
    skipped or empty.
- CRM assistant quotations, money and customer list (ADR 0148), debt:
  - In production (verified 11/11/2026).
  - Stored-answer token size, worst case 20 rounds in each of 20 lists, is
    bounded by count, not by bytes.
  - The web wait-line labels for `list_customers` are not added; it falls back to
    the generic line, as `get_history` does.
- CRM assistant KPI tools (ADR 0151), debt:
  - Built, not shipped; no migration.
  - Room-scope metrics must be hidden from readers without `kpi.view-all` inside
    `KpiService.me` (owner decision 11/11, KPI restructure worktree); the tools
    depend on it.
  - Open for the owner, before that change merges: a seat that lost `kpi.view-all`
    still gets stored room-scope answers replayed, since `reveals` is fixed per
    tool (per-answer `reveals`, or no room-scope readings in `get_my_kpi`).
  - The named-team path of `get_team_kpi` computes everyone's forecast and then
    filters.
  - The eval seed covers `signed-value` only; no ratio metric is seeded.
  - Durations and period labels rely on the prompt; no binder key family or
    period formatter yet.
- A-3, finding several contacts for a lead: approved 01/11, not built (10/11: a
  grep of `apps/api/src` for a legal representative or a leadership page finds
  nothing). Sources: legal representative from the business register, "Ban lãnh
  đạo" / "Liên hệ" pages, company press releases; public LinkedIn gives name
  and title only. Result goes into the contact block with the AI mark and its
  source, de-duplicated by name, email, number. Canvas, artboard 4:
  https://claude.ai/artifact/GMHJUr1m1nyrQ4CyoB3C2x
- After A-3: a bulk fill step before leads are written to the DB (sheet
  import, image scan), reusing the fill core and the tray; move the scan
  prompt to the standard prompt frame (open question 133).
- Other AI ideas, 06/10, **proposed by Claude, never approved by the owner**:
  - Owner's three directions: find and score leads; analyse customer
    conversations; one chatbot across the CRM (the last is ADR 0133).
  - Unbuilt per-flow ideas: fuzzy duplicate-lead merge hint; "who to contact
    today and what to say"; campaign letter drafts by industry and group
    history; classify a customer's reply (interested, refusing, asking price) —
    needs reply capture, which waits on the MX record; opportunity-at-risk
    warning and probability; a summary for the approver of what differs from the
    quote; a "story so far" at handover; plain-words explanation of
    performance changes; churn and upsell signals after sale.
  - Claude's suggested order: "today for this lead" and the handover summary
    next; forecasting and churn only after some months of real data.
  - Every one obeys law 9: proposal with basis, waits for a press; nothing
    writes, sends or moves a stage by itself. A chatbot reads through E2 like
    any other door.

## KPI

Built through wave 2b (ADR 0112 to 0120).

- In production (verified 10/11/2026: commit b5ac18a3 is on origin/master,
  Neon has migration 0164 applied, Fly runs it as v217): ADR 0143 (weighted
  pipeline beside the linear forecast), ADR 0144 (quotes-sent and sales-cycle
  metrics, off by default), ADR 0145 (morning digest of four low-weight bells;
  the Monday-to-Friday amendment), ADR 0146 (quarter view, accepted; read-only,
  `GET /sales/kpi/quarters/:quarter/me` and "KPI của tôi" only, no migration).
  Open questions 173 to 178 are answered (10/11).
- KPI read holes (ADR 0143 amendment): built 10/11/2026, ships with the
  assistant reach fix. Release note: a holder of `performance.view` without
  `kpi.view-all` loses the company KPI screen and its nav entry. Open
  questions 179 to 182.
- Debt: `openPipeline` runs uselessly when a team lead reads a member's
  forecast.
- Owed on the above: the first digest run has not been seen in the Fly logs;
  probability coverage on Neon is not measured.

- 2c: start date, ramp factor and exceptions for joining, leaving, changing
  group or role (needs a start date and a leave date on the account). Not
  built; no ADR, no migration (10/11).
- 2d: contract credit split between up to three people, summing to 100%, head
  approves, locked at signing; ADR 0110 (the closer earns the commission)
  stands. Not built.
- 2e: remove the old screens and flows after a month in parallel; the
  migration that breaks things ships on its own. Not built.
- Wave 3, plan from capacity: metric dictionary (seven columns for each
  catalog metric; a metric with no source cannot be switched on), leading
  indicators, capacity suggestion and gap, "my plan". Needs the owner's
  answers Q5, Q6, Q7. Q7 (5% tolerance) is only a config value through the
  existing approval flow.
- Wave 4, forecast and review: weekly forecast meeting, forecast accuracy by
  head, total score and grade with a 1:1, quarter and year periods, seasonal
  factor, closing the loop into next month's suggestion. Needs Q8 and Q9. Q8
  reverses an earlier owner decision (bell from the 16th): ask, apply no
  default.
- The design page holding Q1 to Q11, the exception matrix and the roadmap no
  longer opens (since 26/10). The exception matrix and Q5 to Q9 have to be
  written again before 2c and before waves 3 and 4.
- Hard date: if the cut stays at 12/2026 the director must close the figures
  before 20/11, so 2a and 2b must be on production by about 15/11. Both are on
  master; production **not checked here**.

## Sales · record screens

- ADR 0078 "done" check, rerun 10/11: `source-detail.tsx` still draws its own
  header; `approvals.tsx` and `comm-log.tsx` are not on `BookPage`; the route
  `/comms/log` still exists and the home screen links to it. `JourneyDrawer`
  and `LeadHistoryPanel` have no code left.
- Eye check of every profile screen on desktop, tablet and phone was never
  recorded as done (law 12, law 13).

## Sales · journey, opportunity, contract money

- Global search is shipped (migration 0088,
  `apps/api/src/branches/sales/search/`) (choices in ADR 0138).
  Not built, as the 08/10 plan left them: field conditions (`email:`, `sđt:`,
  `mst:`, `phụ trách:`), search inside notes, comms and minutes (needs
  `tsvector`), how long the search log is kept and who sees "searched, found
  nothing". The plan also proposed one exception to the no-tests rule: a test
  that locks SQL `sales.fold` to TS `fold`; not asked of the owner (open questions 167 to 170).
- Quotation gap backfill (`pnpm --filter @pv/api db:backfill:quotation-gap`,
  preview first, `--apply` writes) was to run once after the deploy that
  followed 0104. Not recorded as run.
- Reported 27/09, **not rechecked**, from the journey screen redesign:
  - `--brand-gold` (the logo colour, `packages/tokens/globals.css`): may it be
    the money-value colour? If so it needs an official token. The money-value
    pill is neutral (`bg-surface-ink/9`) until this is answered.
  - The open-opportunity label "Đang triển khai" is easily confused with the
    contract rung "Triển khai".
  - The mock has no waiting-group door concluded by the machine (C5) and none
    carrying the no-contact flag (C4); the code has the branches, no screen
    shows them yet.
  - The contract code is not clickable: `chainPath` has no `HĐ` because the
    contract module was held at the time.
- Reported 29/09, **not rechecked**: stop, milestone and next-step doors write
  no `platform.audit` row (the sign door does); a mail template's milestone is
  read at send, not captured at queue (needs a column on `mail_run`);
  `platform.approval.decided_by` is `text`, possibly a name not an id.
- Reported 17/09 and 21/09, **not rechecked**, beyond what ADR 0062 "Nobody
  has paid for these yet" already holds:
  - Eye check, law 13: yellow labels "Còn thiếu" and "Chờ duyệt ký" on the
    stone theme; Badge and MetaPill warning tone under 4.5:1 there; `md`
    buttons (40px) on the lead and deal toolbars and drawer footers need 48px
    on tablet.
  - Journey kanban (`?view=kanban`, `apps/web/src/pages/workstreams-board.tsx`)
    never looked at in a browser: OP/HĐ chip on touch and hover; the "not
    built" column against the stone background; step-card `clipPath` cutting
    the hit area at the edges; the six-step rail at 768px and 360px; the
    triangle under the current step cut by `overflow-x-auto`; the inset shadow
    at the column foot over the last card's text; where focus lands after a
    view switch.
  - Race locks (edit order against approve sign; leave the funnel against
    create order) were only tried one after another on PGlite, never under
    concurrent load.
  - Config screen: still a deadline cell for the TIER ladder (0057 §4
    deferred it); a set deadline cannot go back to "none"; stages and tiers
    cannot be renamed.
  - A sign requester removed from the deal before approval is still recorded
    as the signer; plain edits of an opportunity leave no touch or audit row;
    a role without `config.view` sees the stop-reason key where the timeline
    should show the label; `apps/web/src/data/plan.ts` still reads stop-reason
    labels from the fixture (10/11: it still imports `EXIT_REASONS`).
  - `sort=lastContactedAt` on the journey book answers 400, not 422; there is
    no 422 in `apps/api/src/platform/http/problem.ts` (10/11: still none).
  - Journey book `hidden` mixes a SQL cut over the whole book with an E2 cut
    over the page alone, so the column foot prints a sentence, not a number.
  - A card that fell back to the lead rung still prints the `overdueBy` of a
    deadline the reader cannot see; hiding it needs a second `CASE` in
    `ORDER BY`.
  - Account lane "Đã mua" counts the current round only;
    `apps/api/src/branches/sales/config/config.repository.ts` may still carry
    the old definition of "signed".
  - Web deferrals: move `ViewSwitch` to `components/`; retry button on a
    column-level error; declare `COLUMN_PAGE_SIZE` beside `PageQuery`.
  - Cost to know: editing a deadline in config recomputes every run standing
    on that rung, linear in the book, measured about 0.12 ms per run on
    PGlite (a ratio, not Neon latency), inside the save request.
