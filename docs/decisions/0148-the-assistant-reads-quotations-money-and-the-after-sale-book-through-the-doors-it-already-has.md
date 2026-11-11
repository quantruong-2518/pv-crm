# 0148 · The assistant reads a deal's quotations and money on `get_record` and lists bought customers with `list_customers`, each through the doors the screen uses

Status: accepted (amends 0133 and 0147: reach re-check applies only to tools that declare `revealReach`)
Date: 2026-11-11
Source: slice 3 of the series opened by 0142; design in the session handoff of 11/11/2026

## Context

Slice 3 answers quotation rounds, contract money and which bought customers need
care. Code: `apps/api/src/branches/sales/assistant/opportunity-money-read.ts`,
`list-customers.ts`, the `get_record` registration in `sales-assistant-tools.ts`,
prompt v10 (`apps/api/src/platform/ai/prompts/assistant.prompts.ts`), contract
`ListCustomersInput` (`packages/contracts/src/assistant.ts`). Gate 0 is still OPEN.

## Decision

### 1 · Quotations and deal money ride on `get_record`, kind opportunity

There is no quotation door of its own; the profile door already returns rounds,
contract headers and payments, so no new door is opened.

- Rounds, contract headers and `quoting` need only `opportunity.view`.
- Payments, `collected` and the totals appear only where `paymentsVisible` is
  true; otherwise the keys are left out, not set to null, because a null tells
  the model the deal has none.
- `codes` = the OP code plus the HĐ codes whose payments are visible, so a stored
  answer quoting payments is re-checked against the contract book.
- A round's `note` and `reasonLabel` are typed text: untrusted, masked without
  `data.export`.
- Lists are cut at 20 with `count` and `more`.
- Contract rows carry `currency`, so the bind prints the right unit; the bind
  gained the money and percent keys (`apps/api/src/platform/assistant/assistant-bind.ts`).

### 2 · `list_customers` over `GET /sales/after-sale`, without the door's three holes

The after-sale door is not inherited as it stands:

- (a) `collected` sums every contract of the lead, past the contract scope of an
  ownOnly reader, and a stored copy could be re-checked only by lead codes. The
  tool carries no `collected`; money lives on the deal read.
- (b, c) The door needs `contract.view` but prints lead data. Each row's lead is
  re-read as the asker through the lead book, and a miss through the lead profile
  door (which also admits carers and deal holders). A row whose lead stays
  unreadable is dropped and counted in `hidden`: a row without a re-checkable code
  could never be re-checked once stored.

Codes are lead codes, never WS- (no kind maps them). The tool has no `recheck` of
its own (the gate uses the first registered tool's). `reveals: 'contract.view'`:
a stored answer goes dark for a reader who lost it. Input is strict; `mine` makes
the server use the asker's own id; there is no `sort`.

### 3 · Platform

- Reload `view` audit lines are written only for revealing calls of tools that
  declare `revealReach` (today `get_history`), since only those revealed content
  that their own door audits. A `list_customers` reveal withholds on reload but
  writes no false content-read line (`chatOf` in
  `apps/api/src/platform/assistant/assistant-refs.ts`, `reaches` in
  `assistant-tools.ts`).
- `hidden` may include rows the tool itself dropped (ToolRead docblock in
  `assistant-tools.ts` amended).
- Prompt v10.

### 4 · The eval

Covers `list_customers` and deal money through a scope group; cases coverage-05
and 06 are rewritten and new coverage cases added.

## Consequences

- Next slice: aggregate and KPI questions.
- Remaining debt: `docs/status.md`.
- Gate 0 command is unchanged from 0142.
