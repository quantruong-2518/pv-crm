# 0073 · An opportunity is opened from the lead with its customer contacts; the customer type is derived, the account is copied

Status: accepted
Source: project owner's decisions in chat, 01/10/2026; design canvas https://claude.ai/artifact/NPU6Fbbkhw2xMYYGRLMc8p

## Context

A deal was created with owners and a name but no record of who on the
customer's side it is about, and `OpportunityCreate` took an `accountCode`
typed by the caller although the lead already knows it. Owner: opening a deal
is one verb done from the lead, and what the deal knows about the customer
comes from facts already recorded, not from a field somebody picks.

## Decision

### 1 · A deal carries its customer-side contacts

Table `sales.opportunity_contact` (migration 0074). At create: at least one
contact, exactly one primary, role optional among decision-maker, user,
influencer. A contact must belong to the deal's lead, or to a sibling lead at
the same account within the creator's lead scope.

Only the create door writes contacts. The import door writes none.

### 2 · No stored deal type

New vs returning customer is derived from `sales.workstream` history at the
account: another WON run means returning; no account means unknown. Renewal and
expansion are Block 5 (ADR 0054) and start from the account, not from the lead
drawer.

### 3 · The account is one fact

The create and import doors copy `lead.account_code`. `OpportunityCreate` no
longer accepts `accountCode`.

### 4 · One read feeds the drawer

`GET /sales/opportunities/open-context?leadCode=`, permission
`opportunity.create`, scoped. It returns the run and its customer status, the
account and its owner (the Sale suggestion is the account owner, ADR 0056), the
deal the run stands on (code and name hidden when the reader may not open it,
stage only), the contacts, and the configured ladder limit of stage `new` as
the Nhận PIC deadline; no new threshold. 404 only for a missing lead, 403 for
a lead not held.

### 5 · UI

One verb, "Mở cơ hội". The drawer keeps a success view showing the new code.
The old `/sales/opportunities/new` page opens the same drawer.

## Open / debt

- Deal profile read and edit of contacts; the update door does not take them.
- "Lượt thứ N" (run ordinal) is not in the contract.
- No manual door to attach an account to a lead.
- Default pre-tick when a lead has two or more contacts (none is ticked now).
