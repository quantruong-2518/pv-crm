# 0056 · An account gets an owner

Status: accepted

Source: project owner's decision in session · `crm_workstream_v2.pdf` ("CRM
master workstream V2", a 3-page diagram of the whole customer journey in five
blocks)

## Context

`packages/engines/src/types.ts` (~line 129) states, as a decision, that "a
company is owned by no seller" and gives the reason: scoping account
visibility would mean a Sale opening a new enquiry cannot see that the company
is already a customer of the person at the next desk. Verified in code:
`sales.account` (`apps/api/src/branches/sales/account/account.schema.ts`) has
no owner column, and `DEFAULT_ROLE_PERMISSIONS` (`packages/engines/src/e2-access.ts`)
carries no `ownOnly` scoping on `account.view` or `account.edit`.

The V2 diagram assigns an Account Manager as owner of the account through
blocks 4 and 5 (customer lifecycle and growth) — the account is who a growth
motion (renewal, expansion, at-risk, churn) is run against, and that requires
someone to be answerable for it.

## Decision

**Add `sales.account.owner_id`.** An account gets an owner.

This changes the fact recorded in `types.ts`, not the reasoning that produced
it — the no-visibility-scoping argument was about `ownOnly` on read/write,
which is a separate question (below), not about whether an owner column
exists at all.

## What this does NOT decide

**Whether `account.view` / `account.edit` should gain an `ownOnly` axis is a
separate question the owner has not answered.** Adding an owner column does
not by itself imply scoping visibility to that owner — the very reason the
column was withheld until now (a Sale needs to see that a company is already
a customer) still holds unless the owner separately rules on it. This is
routed to `open-questions.md`, not decided here.

## Consequences

**This sits on top of unpaid debt that becomes load-bearing the moment scope
depends on ownership.** E2's `ownOnly` axis compares display **names**, not
actor ids: `packages/engines/src/e2-access.ts:440` checks
`ref.owner !== actor.name`, and `lead.mapper.ts:256-261` names this a known,
unpaid debt (`toRef` passes `ownerName`, a display name, "because E2's scope
axis currently compares `ref.owner !== actor.name`"). Two actors sharing a
display name would have their scope checks agree by accident. If
`account.view`/`account.edit` ever does gain an `ownOnly` axis (the open
question above), it inherits this exact debt unless the id-comparison fix
lands first.
