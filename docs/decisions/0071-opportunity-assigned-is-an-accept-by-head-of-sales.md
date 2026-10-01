# 0071 · `assigned` is an explicit accept by a head of sales; creating an opportunity is a permission of its own

Status: accepted (partially supersedes 0064 §3 `new` → `assigned` row, §4 and
§5 for the new doors; refines 0069 §10's holder)
Source: project owner's decisions in chat, 01/10/2026

## Context

0064 derived `new` → `assigned` from the PIC set: one `head-of-sales` plus one
other, never shrunk. That makes the stage a side effect of who is typed into
the owners list, not a fact somebody did, and anyone with `opportunity.edit`
could create a deal. Owner: the stage follows a recorded fact (same
philosophy as 0063/0064), the head of sales accepts a deal from a queue as in
mainstream CRMs, and at every moment one person is accountable.

## Decision

### 1 · Who may create

Only BD (and the account-executive seat, which includes BD), head-of-sales
and director. Sale, presales and marketing may not. New permission
`opportunity.create` gates `POST /sales/opportunities` and the import door,
replacing `opportunity.edit` there.

### 2 · Prefill at create

The creator is prefilled (editable, not locked), matched by actor id.

- BD creator: into the BD lane; the SALE lane stays empty.
- Head-of-sales or director creator: counts as having accepted the deal (§3),
  with the lead's BD prefilled into the BD lane.

A deal must always have someone accountable: create, update and import
refuse when both lanes are empty and there is no acceptor.

### 3 · `assigned` is an accept

`new` → `assigned` ("Nhận PIC") is no longer derived from the PIC set. A head
of sales or director presses "Nhận PIC" → `POST /sales/opportunities/:code/accept`,
new permission `opportunity.accept` (director and head-of-sales only; ADR 0004,
one route one permission). It stores `accepted_by_id` and `accepted_at` on
`sales.opportunity`, moves the stage forward-only, writes the stage event and
the touch. The body may optionally assign SALE owners in the same call.

A head or director who creates the deal is recorded as acceptor and the deal
is born `assigned`; so is a deal imported by an accept-holder. Born-accepted
deals write the same accept touch as the door. Head of sales is a recorded
acceptor, NOT a PIC lane.

### 4 · The SALE lane may be empty until signing

A seller is one definition: role `sale` or `account-executive`
(`isSellerRole` in `@pv/contracts`). The contract no longer requires at least
one SALE owner at create or update. The sign door (`POST /:code/contract`)
refuses with 409 when there is no seller on the SALE lane. A newly added
SALE-lane owner must be a seller; migrated rows with a head on SALE stay
editable.

### 5 · Accountable holder

For the mirror, the journey and the ContextRail: the first seller on the SALE
lane; else the acceptor; else the first BD owner (still alphabetical within a
lane, there is no order column). Refines 0069 §10.

### 6 · Refusing

A head who finds the deal not worth pursuing uses the existing stop door with
the `new`-stage reasons. There is no separate refuse door.

### 7 · Migration backfill

Deals at `assigned` or beyond, including lost ones whose stopped-at stage is
`assigned` or later: `accepted_by_id` = a head-of-sales currently among their
owners, else a director among them, if any; it may differ from the `by` of the
old → `assigned` stage event (deliberate: the acceptor is the head standing on
the deal). `accepted_at` = when they entered `assigned` (stage event),
else `created_at`. Deals without one stay null. No CHECK ties stage to
acceptance, because old rows cannot satisfy it.

## Superseded

- **0064 §3** — the `new` → `assigned` row ("the PIC set is satisfied …").
- **0064 §4** — the whole PIC section (head/member split, "replace or add,
  never shrink", last head of sales).
- **0064 §5** — for the new doors: create needs `opportunity.create`, accept
  needs `opportunity.accept`.

## Open / debt

- Import does not queue the new-deal mail.
- PATCH owners leaves no touch or audit.
- The accept door is unscoped; this matters only if an admin grants accept to
  an `ownOnly` role.
- The mirror owner of migrated deals keeps the 0069 holder until the next
  write.
- Heads still sitting on the SALE lane of migrated deals (the leaderboard
  credits them): owner decision whether to strip them.
- An `ownOnly` BD loses the deal from the ContextRail once a head accepts (the
  rail cuts on the mirror holder; pre-existing for any non-holder BD).

## Out of scope

- Commission split between SALE, BD and head.
- Presales in the PIC.
- Notifying heads of a new deal stays the existing ops-mailbox mail until the
  bell turn (0069 §13).
