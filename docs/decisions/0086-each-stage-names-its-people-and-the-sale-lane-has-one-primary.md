# 0086 · Each stage names its people from one fixed rule table; the SALE lane of an opportunity has exactly one primary

Status: accepted (refines 0071 §5)
Source: project owner's decisions in chat, 11/10/2026

## Context

"Who is the person in charge" was answered differently on each stage and, on
an opportunity, re-derived on every read from name order (0071 §5). A deal with
two sellers had no stored answer to "which one is accountable". Once a
contract exists the deal's owners keep moving, so the contract could not say
who stood on the deal when it was signed.

## Decision

### 1 · One rule table, fixed in code

Which stage has which roles, one person or many, may it be empty, does it
carry a primary: `PIC_RULES` in `packages/contracts/src/sales/pic.ts`. Not
configurable in the Cấu hình screen. It is a DESCRIPTIVE table: screens read
the lane labels and the "has a primary" flag from it; the server does not read
it. The server's enforcement lives in `salePrimaryOf` (`opportunity-owners.ts`)
and the database constraints of migration 0100. Account is absent on purpose: an account
has no holder (0084 §5).

### 2 · Exactly one primary on the SALE lane

On an opportunity, whenever the SALE lane is non-empty exactly one person on it
is the primary ("Sale chính"). BD has no primary. Rejected: one primary per
role; no primary.

Whenever the SALE lane holds a seller, the primary must be a seller; a request
naming a non-seller is refused. So "Sale chính" and the holder are the same
person except on legacy lanes with no seller at all.

### 3 · Presales has no lane on the opportunity

Owner: "chưa cần". Not modelled.

### 4 · The contract snapshots the deal's people at signing

A contract keeps its single owner and, additionally, the deal's SALE and BD
people as of signing (`sales.contract_participant`). Not edited afterwards:
enforced by there being no door that edits it, not by a trigger. Two writers
exist: the sign transaction (`contract.repository.ts#insert`) and the dev seed
(`apps/api/src/seed.ts`). After signing the SALE lane cannot move through any
door (hand-over only touches open deals; PATCH and assign refuse); only the BD
lane can still change, so the snapshot's value is the BD lane and the record
itself. It stores actor ids, so a renamed person shows
under the current name.

### 5 · The holder — refines 0071 §5

`holderOf` (`apps/api/src/branches/sales/opportunity/opportunity.mapper.ts`):
the SALE primary if that person is a seller; else the first seller on the lane
(name, then id); else the acceptor; else the first BD. This REFINES 0071 §5,
which had only "first seller". The backfill was chosen so that no existing
deal changed holder.

### 6 · One chooser, and which door may move the primary

`salePrimaryOf` (`opportunity-owners.ts`) is the one chooser every door uses:
requested, else the current one if still on the lane, else the first seller by
name/id, else the first person.

- Past `new`, only the assign door (`POST …/sale-owners`) may move the primary;
  PATCH refuses with 409. One named exception: the lead hand-over
  (`opportunity-handover.ts`), which runs under the lead's permission. When the
  giver was primary the taker inherits it if the taker is a seller (or the lane
  has no seller); otherwise the chooser picks.
- Accept judges `salePrimary` against the merged lane.
- A PATCH that changes only the primary counts as a lane change, so it is
  frozen while a sign request waits.
- The dialogs send `salePrimary` only when the user chose one (the create
  drawer sends its visible default); otherwise the server chooses.

Storage and backfill rules: `apps/api/drizzle/0100_person_in_charge.sql`
(its comments are the record).

## Consequences

- Existing contracts were backfilled with the deal's people as of migration
  day, not signing day — nothing recorded the signing-day list.
- A legacy deal with a non-seller (a head) alone on the SALE lane: that person
  is marked primary, but the holder stays the acceptor, else the first BD, as
  before.
- Rows written by old code between migrate and deploy have no primary. Readers
  fall back. The doors that heal it: every lane write, the lead hand-over, and
  signing (which sets a primary before it snapshots). Hence: migrate and deploy
  together.
- Ship order: 0100's journal timestamp is later than the unmerged
  `0099_notification`. If 0100 reaches Neon first, drizzle skips 0099 for good.
  0099 must go first or be restamped.
- Before shipping, read on Neon: deals with two or more sellers on SALE (the
  backfill picks by name order, which may not be who the team considers
  accountable), and campaigns whose `owner_id` names no actor (the migration
  nulls them so the new foreign key can build).
- The web screens were built without being opened in a browser.
- Out of scope, unchanged: commission split (0082 §1, question 36), SDR role
  (question 23).

## Open

Not decided; each is a numbered question in `open-questions.md`:

- Presales getting a lane later (question 53).
- A primary on BD or every lane once commission split is modelled (question 54).
- Who is accountable on existing multi-seller deals (question 55).
- Unifying the lane wording on screens (question 56).
- Freezing names, not only ids, in the contract snapshot (question 57).
