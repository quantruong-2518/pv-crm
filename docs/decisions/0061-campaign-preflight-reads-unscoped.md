# 0061 · The campaign preflight is its own door, and it reads unscoped on purpose

Status: accepted
Source: lượt 2 của module Chiến dịch, 20/09/2026

## Context

`POST /sales/mail/preflight` answers "who will actually receive this" for a
hand-picked list. A campaign needed the same answer for the audience frozen in
`campaign_member`, and the obvious move — add a `campaignCode` field to
`MasPreflightRequest` — is wrong twice over.

Reviewing it also surfaced a defect that had already shipped: `MasService.send()`
reads a campaign's audience with `scoped: campaignCode === undefined`, i.e.
UNSCOPED, because the server picked those rows out of `campaign_member` rather
than the caller picking them. `MasService.preflight()` hardcoded `scoped: true`.
On a campaign holding somebody else's leads the dry run therefore called them
missing and the send mailed them anyway — and the screen had a hand-written
workaround whose comment explained the lie rather than fixing it.

## Decision

**1 · A separate route: `POST /sales/campaigns/:code/preflight`,
`campaign.broadcast`, scoped.** The MAS door declares `lead.send-email`; a dry
run of `/start` has to demand what `/start` demands. Folding both into one route
means reading the body before knowing which permission applies — exactly what
ADR 0004 split `/start` and `/stop` to avoid. No request body: the audience is
`campaign_member`, not a pick.

**2 · It reads UNSCOPED, the way the send does.** A preflight that judges a
different set from the flight it precedes is worse than no preflight.

**3 · The scope rule is written once, in `scopeFor(campaignCode?)`.**
`preflightCodes` takes `campaignCode`, not a `scoped` boolean: the caller says
what it IS and the helper decides. The bug above is what a boolean at each call
site produces, and a fourth door would reproduce it.

**4 · No `hidden` field on the response.** `MasPreflightResponse.hidden` exists
because the scope axis can cut a pick out of the answer. This read is unscoped,
so `sendable + blocked` is the whole audience and a missing member would be a
bug, not a permission.

**5 · `alsoRunning` is a WARNING, not a block.** Nothing refuses a letter to
someone another running campaign is also mailing, and the server sends it.
`campaign_member` is per campaign, so the collision is invisible everywhere
else — the campaign book's own scorecard counts sends rather than people.

## Consequences

**Campaign membership is campaign data, not the lead holder's.** Reading a
campaign you own shows every member's company, contact name and email even
where the `ownOnly` axis would hide that lead in the lead book. This is not new:
`GET /sales/campaigns/:code/members` has always read `sales.lead` without a
scope clause, under the wider `campaign.view`. The preflight adds only
`contactTitle` and the block reason, behind a narrower permission. Recorded here
because it should hold by decision rather than by nobody having looked.

**No audit trail on either door.** `E2.log()` exists and neither `memberList`
nor `preflight` calls it, in line with the rest of the Sales branch. Logging one
door alone would be worse than logging none — still open, and it belongs to the
branch, not to this module.

**`overlappingRuns` returns one row per (lead × other campaign) pair**, with no
`GROUP BY`, while the screen only counts distinct leads and names. Bounded in
practice by the batch ceiling; collapsing it means changing `CampaignOverlap`.
