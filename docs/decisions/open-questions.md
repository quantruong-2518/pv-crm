# Open questions

Questions the project owner has to answer. None of these is a decision, so none
of them is an ADR — an ADR with `Status: accepted` on an unsettled question is
worse than no record at all, because the next agent will build on it.

Recovered on 16/09 from the Vietnamese handover documents, immediately before
those were deleted. Each line names where it came from, so the wording can be
checked against `git show` if the original is ever needed.

## Engine and schema

1. **Two places where the engine disagrees with the tables.** `filledSlots()`
   in the engine and the SQL-backed slot rule read _different columns_ for slots
   4 and 5; they agree today only by coincidence. And `isRunning()` still checks
   fixture fields (`exitReason` / `contractCode`) instead of
   `NOT EXISTS(contract)`. Flagged as "must be settled before real leads arrive".
   _(was `ban-giao-db.md` § "HAI CHỖ ENGINE ĐANG LỆCH BẢNG")_
2. **`sales.contract` has no `UNIQUE(opportunity_code, lead_code)`.** The "one
   deal, one contract" invariant is held only by a 409 in the service layer —
   unpaid debt, not a ratified decision to leave it that way.
   _(was `ban-giao-co-hoi.md`)_
   **Answered 29/09/2026: no `UNIQUE` on `contract.opportunity_code` — a won
   opportunity can sign again, ADR 0069 §5.**
3. **Contract-code prefix.** Whether `HĐ` is shown on screen at all, and if so
   whether it becomes `HD` or `CTR`. Stated unresolved by the owner as of 14/09.
   _(was `fix-later.md` §14; see ADR 0012)_

## Pipeline

4. **First-stage deadline basis** — measured from `created_at` or from
   `stage_since`. _(see ADR 0032)_
5. **`stage='da-bao-gia'`** — keyed off `state`, or off `EXISTS(quote)`.
   _(see ADR 0033)_
   **Moot 29/09/2026: the `quotation` stage follows the recorded
   `quotation-sent` milestone (ADR 0064 §3), sub-rungs in ADR 0069 §8.**
6. **Discount threshold** — no number is set anywhere, and none was invented.
7. **Where "demoed" is printed** — a flag, or a `pipeline_position` field. Only
   the requirement that the signal survives is settled. _(see ADR 0032)_

## Mail and consent

8. **Which lead source counts as opted in** for MAS mail. `APOLLO` is
   warned-not-blocked (a conscious owner decision). `LANDING_PAGE` is tentative —
   consent to a contact form is not consent to marketing. `IMPORT` cannot be told
   apart by machine without a `consent_at` column supplied by the importer.
   _(was `ban-giao-mas-mail.md` § AUP and `con-thieu-mas-mail.md` D4)_
9. **Password-reset mail bypasses the suppression list.** Explicitly recorded as
   "not obvious, hence a question, not a task". _(was `fix-later.md` §8)_
10. **Apollo import dedup.** An external-source / external-id column was drafted
    then reverted at the owner's explicit request ("take the existing schema as
    the standard"). The dedup-on-email-only risk that leaves behind is unresolved.
11. **Five Apollo mapping gaps**: email-verification columns · Do Not Call and
    suppression · five engagement columns (no `touch` table yet) · six company
    financial columns (do **not** map `Annual Revenue` to `budget`) · seven
    classification columns. _(was `ban-giao-lead.md` § "6 nhóm cột không hiểu được")_

## Mail statistics

12. **Unsubscribe-rate denominator** — `sent` or `delivered`.
13. **Retention period** for status history and engagement events.
14. **CSV export** at recipient level, or aggregate only.
15. **Which roles** may see the email address and the error detail.
16. **Splitting the MAS Resend account** from transactional — before or after the
    first real canary.
17. **Does a complaint still count as "delivered"** under an "ever was delivered"
    reading of history.
    _(12–17 were `ban-giao-thong-ke-mail-status.md` §12)_

## Comms

18. **Does the `account-executive` role hold the `contact@` mailbox.** Recorded
    as a question for the project owner, not for an agent. _(was `fix-later.md`, comms §c)_
19. **On a `lead.email` change** — create a new `comms.identity` row or update the
    existing one, and whether `verified_at` is nulled or kept. Marked "settle
    before batch 2". _(was `fix-later.md`, comms §d)_
20. **Where comms thresholds physically live.** The principle is settled (config,
    not code — ADR 0053) but `config_entry` cannot hold a scalar threshold as it
    stands. _(was `ke-hoach-thi-cong-comms.md` §11.4)_

## V2 scope reopening (added 16/09/2026)

21. **Is invoicing back in scope.** ADR 0054 reopens blocks 4 and 5 of the V2
    customer journey but explicitly does not reverse ADR 0030's exclusion of
    invoicing and receivables — the owner has not ruled on it either way.
    _(see ADR 0054)_
22. **Should `account.view`/`account.edit` gain an `ownOnly` scope axis** now
    that `sales.account.owner_id` exists (ADR 0056). Adding the column does not
    by itself answer whether account visibility should be scoped to its
    owner — the original reason it was left unscoped (a Sale needs to see a
    company is already someone else's customer) still applies unless the
    owner rules on it separately. _(see ADR 0056)_

## Lead lifecycle (added 18/09/2026)

23. **Whether SDR is a new role or maps onto an existing one.** The V2
    diagram assigns lead creation, first contact, nurture and disqualification
    to an SDR role, and conversion to BD. There is no SDR role in the E2 role
    matrix today (`packages/engines/src/e2-access.ts`: director, head-of-sales,
    marketing, bd, presales, sale, account-executive). Until the owner
    decides, the PIC-driven transitions in ADR 0058 use the existing
    permissions (`lead.edit` scoped for the PIC's own moves, `lead.disqualify`
    for disqualify/reopen). _(see ADR 0058; ADR 0086)_

## Shared flows (added 28/09/2026)

Raised while drawing row F of the workstream canvas. The decisions they hang on
are in `.claude/HANDOFF-workstream-loop.md`; the presale ones are ADR 0067.

24. **The "done" label of the shared due ladder.** `DueLevel` now covers next
    steps, installments, rollout milestones and time spent at a rung, but the
    product's only label for `done` is "Đã thu" (`DUE_LABEL` in
    `apps/web/src/data/contracts.ts`), which is about money. The canvas uses
    "Đã xong" for the non-money kinds until the owner names one.
    **Answered 28/09/2026: "Đã xong" — ADR 0067 §7 (D8).**
25. **Bulk send with a template that carries a file.** Attachments are allowed
    only in group send, and the "Báo giá" template attaches the latest quote
    PDF. Either bulk send is allowed and drops the file, or a template that
    carries a file forces group send.
26. **Which stop reasons carry the no-contact flag.** The shared reason
    catalogue gives each reason a "Không liên hệ" flag (never mailed, never put
    in a campaign), but no reason carries it in code yet. The canvas flags
    "Không phải khách của mình" and "Trùng opp khác" as placeholders.
    **Answered 28/09/2026: "Không phải khách của mình" and "Người liên hệ nghỉ
    việc" — ADR 0067 §4 (D5).**
27. **What a customer reply on an opportunity or a contract moves.** A reply
    counts as a real exchange and moves the LEAD a rung; an opportunity or a
    contract has no rung it maps to. The canvas only rings the holder's bell.
    **Answered 29/09/2026 for opportunities: recorded in its activity only, it
    never moves a rung — ADR 0069 §9. Contracts stay open until Postsale.**

Raised 05/10/2026 while reviewing the lead profile screen (ADR 0079).

28. **Is `plants` dropped for good?** "Số nhà máy" left the lead and company
    forms, but the column and the contract field `plants` stayed, because
    dropping them is a destructive migration nobody asked for. Nobody decided
    whether they go.
29. **Do the opportunity and contract profiles move their primary move to the
    bar too?** The lead did (ADR 0079 §2); the other two still draw it in the
    todo card.

Raised 08/10/2026 while scoping the "Khung hành trình" config area (ADR 0080).

30. **Is "next step required" per state a soft indicator or a hard refusal?**
    It collides with the workstream-loop handover's rule that a next step is
    optional with no warning (decision G2 there) and with the always-required
    rule at comm close-out (ADR 0074 §5).
31. **Should entering a state auto-create a next step?** It collides with one
    step per object (decision G1 in the same handover; the step table's
    primary key is the subject), with `doer_id`/`created_by` being NOT NULL
    when a `new` lead has no holder, and with births and owner changes that
    bypass the state writers.
32. **Should finishing a step advance the state?** Every existing mover is
    fact-triggered (ADR 0063/0068, ADR 0064 §3, ADR 0071 §3). A step-done that
    writes the state would bypass `opportunity.accept` and could place a deal
    in `quotation` without the `quotation-sent` fact that signing requires.
33. **Does a lead state get its own deadline?** ADR 0067 §7 (D8) and ADR 0057
    §4 suspended lead-rung deadlines; the lead clock today is the TIER ladder.
34. **Can a state be renamed from config?** Labels have two sources today: the
    config row name and the `OPPORTUNITY_STAGE_LABEL` / `LEAD_STATE_LABEL`
    constants.

## KPI (added 09/10/2026)

Raised while recording the KPI framework (ADR 0082).

35. **Is the fixture "Hiệu suất" screen retired?** `/sales/performance` still
    exists beside the two KPI screens and carries its own KPI model
    (`ROLE_KPI_MODEL`). _(see ADR 0082)_
    **Answered 09/10/2026: retired — the page, the route and the nav row are
    deleted, the two KPI screens replace it, ADR 0082 Consequences.**
36. **Is KPI linked to pay, and how is commission split?** v1 has no pay, bonus
    or commission maths. The split between SALE, BD and head was already out
    of scope in ADR 0071. _(see ADR 0082 §1, §8; ADR 0086)_
37. **Do accountant and delivery become roles?** Neither has a seat, and a
    payment records no actor and no partial amount, so nothing of theirs can
    be scored. _(see ADR 0082 §8)_
38. **Does the pace verdict get a tolerance margin?** v1 has none — a margin
    would be an invented threshold. _(see ADR 0082 §4)_

## Lead admission (added 11/10/2026)

Raised while recording the admission gate (ADR 0084).

39. **Can one company legitimately have two open leads at once?** Default in
    code: exactly one open lead → a new person is attached to it; two or more
    → `needs-review`. _(see ADR 0084 §3)_
    **Answered 11/10/2026: yes — several open leads on one account; the manual
    form asks merge or new lead, `needs-review` now means only unsure evidence,
    ADR 0084 §3.**
40. **Should a re-entry through file import leave a `re-entered` touch when the
    row is an exact repeat?** Default: no, the row is dropped and reported.
    _(see ADR 0084 §5)_
41. **Should the landing door auto-attach to an open lead, as built, or always
    open a new lead?** Default: the same person leaves a touch only; a new person opens a new lead
    on the same account.
    _(see ADR 0084 §5)_
42. **Who gets sourcing credit when a duplicate is entered by a second
    person?** Default: the first; the second leaves only the touch.
    _(see ADR 0084 §6)_
43. **When may `account_identity_uniq` be tightened to the folded keys?**
    Default: unchanged until existing duplicate accounts are cleaned up.
    _(see ADR 0084 §8)_
44. **Should a seller who hits someone else's customer be able to raise a
    request to the head of sales from the form?** Default: the form only tells
    them to contact the head. _(see ADR 0084 §5)_
    **Withdrawn 11/10/2026: moot — there is no owner of an account, only of a
    lead, and any caller who may create leads may open another one, ADR 0084
    §5.**
45. **Should scanning a card that adds nothing new leave a `re-entered` row
    every time?** Default: yes. _(see ADR 0084 §5; ties to question 40)_
46. **Should a company-record mailbox count as evidence against the book?**
    Default: no. _(see ADR 0084 Consequences)_
47. **Where should a `re-entered` touch be shown on the lead profile?**
    Default: nowhere yet. _(see ADR 0084 Consequences)_
48. **Should a file-import row whose evidence is uncertain (`needs-review`)
    wait for a person instead of being written?** Default: it is written as a
    new lead and marked in the result. _(see ADR 0084 §5)_
49. **May a seller claim a customer whose leads are unowned through the
    form?** Default: no — unowned leads count as outside an own-only seller's
    scope. _(see ADR 0084 §9)_ After 11/10/2026 nobody holds a customer and
    any caller may open a lead on the company, so the owner should confirm
    whether this is withdrawn.
50. **Should the account profile filter its leads, owners and contacts by the
    reader's scope?** Default: no filter — existing behaviour. _(see ADR 0084
    §9)_
    **Answered 11/10/2026: as intended — every role may view and add leads, ADR
    0084 Consequences.**
51. **Should the check door be rate-limited or audited?** Default: neither.
    _(see ADR 0084 Consequences)_
52. **Should an email-only match be downgraded to `needs-review` when the
    incoming company name is different and unmatched?** Default: no.
    _(see ADR 0084 Consequences)_
53. **Should joining a lead (merging, adding a contact) stay limited to a lead
    in the caller's scope?** Default: yes — the assistant's choice, not an owner
    decision; opening a new lead on the same company is not limited.
    _(see ADR 0084 §5, §9)_
54. **File import: which open lead does a new person join when the company has
    several, and should a new person with no open lead of the company in the
    importer's scope open one?** Default: joins the first-ranked open lead in
    the importer's scope; with none in scope, opens one new lead on the matched
    account per company per file, never reported as a duplicate — the
    assistant's reading, mirroring the landing door, not an owner decision.
    _(see ADR 0084 §5)_
55. **Should the scan preview name the lead and its owner for a group held as
    HELD_OTHER_OWNER, as the form and the import report now do?** Default: no,
    unchanged. _(see ADR 0084 §5)_
56. **Should a tie count only leads the caller can join?** Today the scan holds
    when the uploader's own lead and a colleague's fit equally, while the import
    joins the uploader's. Default: any two open leads tie. _(see ADR 0084 §5)_

## Person in charge (added 11/10/2026)

Raised while recording the per-stage people rules (ADR 0086).

57. **Should presales get a lane on the opportunity later?** Default: no
    (owner 11/10: "chưa cần"). _(see ADR 0086 §3)_
    **Answered 12/10/2026 (delegated to the assistant by the owner: "do what
    matches real practice"): no lane; revisit only if presales starts being
    credited on deals.**
58. **Should BD (or every lane) also carry a primary once commission split is
    modelled?** Default: no. _(see ADR 0086 §2)_
    **Answered 12/10/2026 (delegated by the owner): no. BD credit is shared,
    and one accountable person per deal is the Sale chính. Revisit with
    commission split (question 36).**
59. **Who is the accountable Sale on existing deals with several sellers — is
    the name-order backfill acceptable, or should the head of sales review
    them?** Default: the backfill stands. _(see ADR 0086 Consequences)_
    **Answered 12/10/2026 (delegated by the owner): the name-order backfill
    stands (it keeps every existing holder unchanged); the head of sales
    corrects any deal through the Giao Sale dialog. Before migration 0100
    reaches production, list the deals with several sellers on the SALE lane
    so the head can review them.**
60. **Should the wording for the two lanes be unified?** Screens say
    `Sale PIC` / `BD PIC`, `BD đứng đơn`, `BD mở cửa`, `Sale đứng đơn` in
    different places; `PIC_RULES` uses "Sale đứng đơn" / "BD mở cửa". Default:
    leave as is. _(see ADR 0086)_
    **Answered 12/10/2026 (delegated by the owner): two registers stay on
    purpose. Seat names on profile rails use the product word "PIC" ("Sale
    PIC", "BD PIC", "PIC lúc ký"); form field labels describe the job ("Sale
    đứng đơn", "BD mở cửa"). No rename.**
61. **Should the contract snapshot also freeze names, not only ids?**
    Default: no. _(see ADR 0086 §4)_
    **Answered 12/10/2026 (delegated by the owner): no; ids only. Actor rows
    are never deleted, so the name stays readable; a renamed person shows
    under the current name.**

## Notifications (added 11/10/2026)

Raised while recording the notification hub (ADR 0085).

62. **Who is told about a campaign, and who is the "operator"?** The campaign
    owner is free text, not an actor, and no "operator" role exists, so a
    notification for either has no recipient the data can name.
    _(see ADR 0085, Not in wave 1)_
63. **Who writes contract instalment and milestone events?** Their tables have
    no writer, so there is no moment to notify on. _(see ADR 0085, Not in
    wave 1)_
64. **Which touch kind records a customer reply on a lead that is `working`,
    `nurturing`, `converted` or in the pool, and on every opportunity?** Today
    only the `assigned`/`verifying` → `working` move writes an activity row.
    _(see ADR 0085, Defaults)_
    **Answered 11/10/2026: a new touch kind `customer-replied`, written by the
    system on every new reply — ADR 0085 Defaults.**
65. **Should a bounce reported after the provider accepted the letter ring
    `mail-failed`?** Today only a letter the worker gives up on does.
    _(see ADR 0085, Defaults)_
    **Answered 11/10/2026: yes for a 1-to-1 group letter only; a bulk run's
    bounces ring nobody individually — ADR 0085 Defaults.**
66. **Where does a press go for run sent, run cancelled, access changed,
    password reset, Google link broken, and a decided approval?** They open
    nothing today. _(see ADR 0085, Defaults)_
    **Answered 11/10/2026: the "Tài khoản của tôi" screen at `/account`; a
    mail-run row opens the mail-run book at that run — ADR 0085 Defaults.**
67. **Should the deal book's last-activity / freshness read count a customer
    reply?** It ignores `customer-replied`, so a deal the customer just
    answered can still read as stale. _(see ADR 0085, Defaults)_
