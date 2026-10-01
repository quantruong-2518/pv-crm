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

## After accept — the `assigned` stage

Source: project owner's decisions in chat, 01/10/2026

### 8 · Reading the lead from a live deal

An `ownOnly` person standing on the deal (deal scope: either lane OR the
acceptor, one SQL fragment used everywhere) of a live deal (open, not signed)
may read that deal's lead (profile, contacts, timeline) and send mail to the
customer from the deal. The widened lead read covers the lead door only; mail
from the opportunity door needs the deal's own scope. Editing the lead stays
with the lead holder. Why: the first work at `assigned` is contacting the
customer, and a Sale handed a deal could not see who to call.

### 9 · Assigning the seller after accept

Assigning or changing the seller after accept is the head's call. New door
`POST /sales/opportunities/:code/sale-owners`, permission `opportunity.assign`
(head-of-sales, director, account-executive; scoped). It REPLACES the SALE
lane, is refused at `new`, is a no-op on an unchanged lane, and only the ids
it ADDS must be sellers (a migrated head already on the lane may stay). Once a
deal is past `new`, the profile PATCH refuses ANY change to the SALE lane for
everyone, assign-holders included; `sale-owners` is the single door. At `new`
the PATCH may still change it. "No seller yet" means no SALE-lane owner with a
seller role, for open deals past `new` at any stage: the head's queue in the
book (`accepted=true` + `sale=OWNER_NONE`). Each
assignment writes a touch, and open next steps move from the old holder to
the new.

### 10 · Notifying the Sale

Notifying the Sale that they were assigned is deferred to the notification
(bell) turn; the touch is the record meanwhile.

### 11 · Journey drawer

The journey drawer gains only "set/edit next step" on the current rung.
Milestones and stop stay on the opportunity profile, so there is one place
where the deal's decisions are made.

### 12 · Next-step suggestions

Per-stage next-step suggestions are display data in the web.

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
- Notification for assignment (§9) deferred to the bell turn; the touch is the
  only record.
- An `ownOnly` BD loses the deal from the ContextRail once a head accepts (the
  rail cuts on the mirror holder; pre-existing for any non-holder BD).

## Out of scope

- Commission split between SALE, BD and head.
- Presales in the PIC.
- Notifying heads of a new deal stays the existing ops-mailbox mail until the
  bell turn (0069 §13).
