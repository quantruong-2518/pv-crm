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
3. **Contract-code prefix.** Whether `HĐ` is shown on screen at all, and if so
   whether it becomes `HD` or `CTR`. Stated unresolved by the owner as of 14/09.
   _(was `fix-later.md` §14; see ADR 0012)_

## Pipeline

4. **First-stage deadline basis** — measured from `created_at` or from
   `stage_since`. _(see ADR 0032)_
5. **`stage='da-bao-gia'`** — keyed off `state`, or off `EXISTS(quote)`.
   _(see ADR 0033)_
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
