# 0142 · The assistant reads companies through the lead and deal doors, and the eval checks the union of the doors a call opened

Status: accepted (amends 0133: company read, eval permission oracle)
Date: 2026-11-10
Source: project owner's decisions in session, 10/11/2026: order of work, and "read the company through the lead and deal doors" over wrapping the profile door as the screen shows it

## Context

The chat has been live for all roles since 0136; gate 0 (a keyed live run on
both vendors) is still OPEN. The owner chose the order: a short setup pass
before widening coverage, then coverage in vertical slices, each with the tool,
its eval cells and its cases. The keyless eval had gone red after commit
7b7f6152 (a lead read now carries its deals).

## Decision

### 1 · The permission oracle compares the union of doors

The oracle compared each tool call with one hand-picked door. It now compares
with the union of the doors the call opened, derived from the tool's own
registration. Adapters are keyed by the tool's door key
(`apps/api/src/scripts/ai-eval/scope-door.ts`); their queries are built from
the seed, never copied from the tool.
Why: a read that opens two doors was judged against one, and the eval went red
for a right answer.

### 2 · Slice 1: `search_records` and `get_record` read companies (`account`)

`AssistantReadKind` (lead · opportunity · contract · account) is the kind of a
read and a ref. `AssistantRecordKind` stays the chat subject, because
`assistant_session.subject_kind` has a CHECK and a company-screen entry was not
asked for (`packages/contracts/src/assistant.ts`).

### 3 · The company read does not trust `GET /accounts/:code`

That route is unfenced by scope (debt in `docs/status.md`; owner: fix in its
own turn). So the read takes only company fields from it and re-reads the child
lead and deal codes through the lead and opportunity book doors as the asker.
Contacts survive only with their lead. Phone and email need `data.export`
(0134 §4). `hidden` stays null. Profile aggregates never reach the model.
Why: the owner chose this over wrapping the door as the screen shows it.

### 4 · What the model is told

Each child list carries the book's scoped `count` and `more`. A shut child door
is named in `skipped`. Prompt v7 says lists are "what the person may see"
("bạn xem được"). Cap `ACCOUNT_LIST` = 20, sized against `REF_CHECKS` and the
40k tool-token cap.

### 5 · The suite

New groups `scope-account`, `cases-coverage` (areas no tool reads yet) and
`cases-linked` (multi-hop). Scripted mode proves plumbing only; these groups
are meant for the live run.

## Known limits

- A company with more than 200 child codes is fenced on the newest 200 only.
- Recheck of an `AC-` code reads a whole profile per code.
- No suggestion chip for a company read (needs a new `AssistantSuggestionKey`).
- Contacts have no count.

## Consequences

- Next slices in order: lead and deal interaction history; quotations and
  after-sale; then aggregate and KPI questions, which need a decision on
  own-only figures first.
- Gate 0 command: `pnpm ai:eval -- --suite assistant --live --yes --model gemini-3.8-flash --model claude-sonnet-5-5`
  with both `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` in `apps/api/.env`; the
  latter is not set locally today.
