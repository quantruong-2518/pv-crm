# 0101 · KPI teams: a team lead splits the team's share, in two tiers

Status: accepted (builds 0100 §D; supersedes 0098 §5's "no manager–employee relation" and 0099 §6's manager–subordinate bullet, for KPI only; amends 0098's package model with a team tier)
Source: project owner's decisions of 19/10/2026 (D1–D7); the last section lists what is not the owner's

## Context

0100 §D decided that KPI gets teams with a team lead and left the shape for a
later round. 0098 had one package per role per month, split by the head of
sales straight to people. This ADR fixes the shape of the team tier. Teams are
KPI only: lead, opportunity and contract access are unchanged.

## Decision (the owner's)

- D1 · Two tiers. The head (a `kpi.set-target` holder) splits a role's target
  across teams AND people in no team, approved as today (approver is not the
  last setter). The team lead splits the team's share across the team's members
  and submits; a `kpi.set-target` holder other than the submitter approves.
- D2 · The team lead is a flag on one member, not a role. They keep their roles
  and get rights only inside their own team. No new permission key.
- D3 · A team may mix roles. Shares are per (role, metric): the room's Sale
  target goes to the teams that have Sales and to Sales in no team; a team's
  Sale share goes to that team's Sales.
- D4 · Teams are optional. People in no team are split directly by the head, in
  the same package.
- D5 · The lead sees a team page: team figures against the team's share, every
  member's scorecard. Nobody outside the team sees it, except `kpi.view-all`
  holders.
- D6 · Counter-proposals on a team package are resolved by the team lead (not
  their own); the head sees them and resolves the lead's own counters.
- D7 · Team changes made after a month's packages were sent apply from the next
  month.
- Decided earlier (0100 §D): the head of sales or the director creates teams
  (name, lead, members) in KPI config; a person is in at most one team.

## Design

### Roster by effective month

A roster is stored per month it changed, not per month it applies to. The
roster in force for month P is the one with the greatest start month not after
P. A header row per changed month exists so that an emptied roster (all teams
deleted) still overrides the older one. A team row carries only its name and
who made it; it is kept for history when the team is deleted. One team per
person and one lead per team are enforced in the database.

### Two tiers on one table

A package on `sales.kpi_allocation` has an optional team. No team means the room
tier (every package from before this ADR). Version and "one live package" are
counted per (month, role, team). A room package carries shares: one value per
(team, metric) for each team that has a member holding the role. A share
counts in the balance exactly like one more holder's line: count and money
metrics at `own` scope must sum to the role target, others are independent
(0098). A team package carries lines for the team's members only and balances
against the team's share in the last agreed room package.

### Who does what

- Head drafts the room package: lines for holders of the role in no team, and
  shares for teams. A line for a team member is refused with the team's name in
  the sentence.
- Only the team's lead, judged by the roster of that month and not by
  permissions, drafts and sends a team package, once the room package is
  agreed with a share for that team. A non-lead `kpi.set-target` holder cannot
  draft or send one, and neither can the head (D1). The number of days to
  answer is required on send, as on the room tier.
- A `kpi.set-target` holder other than the submitter approves or returns a team
  package (the existing two-person rule).
- Members acknowledge or counter through the same doors; the door finds the
  package holding their line, room or team tier.
- A counter on a team package is resolved by the lead, never by the proposer;
  the head resolves the lead's own counters through the existing door. A
  reissue of an agreed team package opens a team draft for the lead to
  rebalance. A re-split of the room tier is blocked only by that tier's open
  counters.
- A person never has lines in both tiers of one month.

### The team page

Route under KPI, not in the nav, for the team's lead and `kpi.view-all`
holders. It shows team figures against the share, every member's scorecard
(built by the same code as the people list), the lead's split per role, and the
team's counters. The lead may also open a member's contributions and history.
The month close needs nothing new: team figures derive from the frozen person
values and the immutable shares.

### The new bell

`kpi-team-share-assigned`, to the lead of each team, when a room package that
gives the team a share becomes agreed. It opens the team page for that month.
Team packages reuse the existing bells (members get `kpi-target-allocated`, the
lead gets `kpi-allocation-returned`, the proposer gets `kpi-counter-resolved`).
Occurrence keys of the existing bells now include the team.

## Defaults that are not the owner's

Taken by the implementer; change them by amending this ADR.

1. The effective month E of a team edit is the month after the last month
   anything was sent for, at either tier, and never before the current Vietnam
   month. Not "the first month with nothing sent": a roster written for an
   earlier month is also in force for every later month, so it would shift a
   later month already sent. Edits always write the roster of E; a month's
   roster freezes once anything for it is sent. This gives D7 and still lets a
   fresh month be set up. **This goes slightly beyond the owner's "from next
   month":** when nothing for the current month has been sent yet, an edit
   applies to the current month. The owner may overrule this.
2. Team edits are direct (`kpi.set-target`), not through the config approval
   flow.
3. Members are active actors holding at least one of marketing, bd, presales,
   sale, account-executive and neither director nor head-of-sales; those two
   are split by the head directly.
4. Exactly one lead per team, and the lead is a member.
5. Deleting a team removes its members from the roster of E; the team row stays
   for history.
6. When the head re-splits and a team's share changes, the team's agreed package
   stays in force (cards keep scoring it) until the lead sends a new version
   that matches; the team page says so.
7. One new bell only, as above.
8. Team figures on the team page: the sum of member values for count and money
   metrics; ratio, hours and days metrics show no team total (members only).
9. (Amendment A2.) When the head resolves the lead's OWN counter on a team
   package, the package's sender stays the team's lead; every other resolution
   makes the resolver the sender, as on the room tier. This avoids a deadlock
   (the head as sender could no longer approve, and a reissued draft would not
   be the lead's to send). **It softens the two-person rule in that one case
   only:** the head counters the lead's own line, then approves. The safety
   kept is that a settled line goes back to pending, so the lead answers the
   new value.
10. (Amendment A3.) A room package may hold zero lines when every holder of the
    role is in a team: it is then shares only. A package with neither lines nor
    shares is refused.
11. Roster writes and every allocation send (both tiers) take one lock, and a
    send re-checks its lines and shares against the roster of the month, so a
    team edit and a send cannot cross.
12. The lead drafts and sends on doors of their own
    (`:period/teams/:teamId/allocations/…`, `kpi.view` plus the lead check), not
    on the room doors, so every door keeps one permission (ADR 0004).
13. A team package cannot be sent while a member holding the role has no line
    for a ratio, hours or days metric that carries a share: such a member would
    otherwise fall back to the whole room's role target.
14. Team names are not unique, and a name may not start with "Nhóm": every
    screen and bell prints "Nhóm {tên}".
15. A room package cannot be sent while a team with a holder of the role gets
    no share, so a team package never stays in force with nothing behind it.
    A team line on a metric the team has no share for is refused.
16. When the team's lead (in the roster of the month) is a disabled account, a
    `kpi.set-target` holder may draft, send and resolve counters for that team,
    since the month's roster is frozen; the two-person rule still applies. The
    owner may overrule this.
17. Members do not see their team's share through their own allocation read;
    the lead sees it on the team page.

## Consequences

- Migration 0120 adds the team, the roster header and the roster members.
  Migration 0121 adds the team column to `sales.kpi_allocation` and replaces its
  two uniqueness rules with ones per team, adds the shares table, and widens
  the notification checks with the kind `kpi-team-share-assigned` and the
  subject kind `kpi-team`.
- 0098 §5's "no manager–employee table" is false for KPI: the roster is one.
  0082 §1 decision 3 is now fully superseded; 0100 §D's "nothing of it exists
  yet" is no longer true.
- A person in a team can no longer be given a line by the head directly; the
  head changes the team's share instead.
- Known limit: one lead per team, so a lead's own counters always go to the
  head.
