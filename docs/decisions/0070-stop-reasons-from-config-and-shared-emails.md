# 0070 · Stop reasons become one admin-editable catalogue shared by both stop doors; a lead's email carries no live-uniqueness; E2 compares the holder by id

Status: accepted (narrows 0057 §2's six closed exit reasons to an
admin-editable catalogue; settles 0067 §4's open question of whether the
catalogue also covers `nurturing` entries — yes; resolves 0068's Open item on
the stop record/reason catalogue; implements 0067 §9 (D4) as described; pays
the debt flagged in `.claude/HANDOFF-workstream-loop.md`, "Còn nợ nhỏ: E2 so
người giữ bằng tên")
Source: project owner's decisions in chat, 29/09/2026

## Context

Three loose ends left by 0067/0068 and one longstanding debt came up together
in the same session: (A) what the shared stop-reason catalogue promised by
0067 §4 actually holds and whether it also covers a lead entering
`nurturing`, which 0068 left open; (B) whether 0067 §9 (D4, no per-email
uniqueness) is fully carried out end to end, including CSV import; and (C)
E2's scope axis still compared a record's holder by display name
(`ref.owner` against `actor.name`), a weaker test than an id comparison and a
debt on record since the workstream-loop handover.

## Decision

### A · Stop reasons are one admin-editable config catalogue, shared by both doors

The `EXIT_REASON` config list ("Lý do dừng chăm sóc") is the single catalogue
for every stop — a lead parking in "Nhóm chờ chăm sóc" and a lead ending in
"Ngừng chăm sóc" pick from the same list, admin-edited on the Config screen
like any other config list. This answers 0068's Open item: yes, the catalogue
covers a `nurturing` entry too, on the same terms as `disqualified`.

The catalogue seeds from the six reasons already in use, with the money one
relabelled "Chưa có ngân sách năm nay"; a virtual entry "Khác (ghi chú)"
requires a note. This narrows 0057 §2's "six closed `EXIT_REASONS`" — the six
survive as the seed, but the list is no longer closed: it is config, open to
admin edits like every other list in `sales_config`.

Statistics count **every stop event**, not the lead's current state: the
reason is stored on the stop's own activity row (the touch that records the
park or the exit), not only as a label on the lead. Because `nurturing` now
loops in place on the same lead (0068 §4) rather than opening a fresh record
each time, a reason kept only on the lead would be overwritten by the next
loop and the count would undercount every reopen. Recording it on the
activity row means a lead parked three times for three different reasons
contributes three counted stops, and a loop never erases the ones that came
before it.

### B · No limit on live leads sharing one email

0067 §9 (D4) is carried out the way it was described, end to end: the
uniqueness index over live leads is dropped, and duplicate detection moves
from a constraint to a read-time lookup. A lead's book computes, per row,
which other live leads share the same email and shows it as a warning
("Trùng email với LD-x") rather than refusing the write. This now also
covers the door 0067 §9 left as future work: CSV import rows whose email
already has a live lead are imported and flagged the same way the landing
door already does, not skipped. Merging duplicate leads by hand is unchanged.
Campaign and group-mail audiences still dedupe per mailbox, so one mailbox
with two live leads is never mailed twice even though both leads are allowed
to exist.

A reader who sees only their own leads still learns that a twin exists
("một lead khác", no code). Owner's call (01/10/2026): two Sales calling one
customer costs more than revealing, inside the company, that the mailbox is
already being worked. No test guards C (owner's call, same day).

### C · E2 compares the holder by id, not by display name

E2's scope axis (`ownOnly`) now compares `ObjectRef.ownerId` against the
actor's id. `owner` (the display name) stays on the ref for rendering only —
it is never compared. A ref that names a holder without an id fails closed:
it reads as belonging to someone else, the same as before the fix, rather
than being treated as unowned. This closes the debt flagged in
`.claude/HANDOFF-workstream-loop.md` ("Còn nợ nhỏ: E2 so người giữ bằng tên")
and in the code comments marked "debt #2" (`packages/contracts/src/sales/lead.ts`,
`packages/contracts/src/sales/lead-import.ts`, `apps/api/src/branches/sales/lead/lead.service.ts`,
`apps/api/src/branches/sales/lead/lead.repository.ts`): two staff sharing one
display name no longer read or refuse each other's rows off the name alone.

## Consequences

- `ExitReason` as a closed enum is gone; `sales.lead.exit_reason` and the
  stop touch's reason column hold a config-entry id (or the virtual `'other'`
  key), the same shape opportunity care reasons already use.
- The unique index over live-lead email is dropped; a duplicate email is a
  book-level warning computed at read time, not a write-time refusal,
  everywhere a lead can be created (landing, CSV import, manual create).
- `platform.object.owner_id` becomes a real column, backfilled from the
  objects that already carried an owner id (lead, contract) and, where a name
  matched exactly one actor, from that match; an unmatched owner is left
  unset rather than guessed.

## Superseded

- **0057 §2** — "six closed `EXIT_REASONS`." The six survive as the seed
  list; "closed" no longer holds (§A).
- **0067 §4** — the open question of whether the shared catalogue also
  records a `nurturing` entry is settled: yes (§A).
- **0068's Open item** — "whether the stop record and shared reason catalogue
  still record a `nurturing` entry" is answered by §A.
- **0067 §9 (D4)** — carried out as described, with the CSV-import gap it
  left named as future work now closed (§B).

## Open

None raised in this session.
