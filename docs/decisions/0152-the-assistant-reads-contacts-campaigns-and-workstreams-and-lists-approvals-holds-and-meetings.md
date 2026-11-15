# 0152 · The assistant reads contacts, campaigns and workstreams through their profile doors, lists approvals, holds and meetings on `list_my_work`, shrinks over-budget results, and offers "Phân tích kỹ" as a person's switch

Status: accepted (amended by 0154: `list_my_work` gains `stale-deal`, `late-debrief` and `overdue-contract`)
Date: 2026-11-15
Source: wave 1b of the CRM assistant, on branch `assistant-wave-1b` (not merged); plan in the Claude doc https://claude.ai/artifact/1r7zdgWt8CBWWCK52DCvCR, section "Kế hoạch phủ đủ sản phẩm"

## Context

Wave 1b is the unbuilt remainder of wave 1, already approved in the ADR 0133
roadmap. Coverage of the 16 product areas goes from 5 full and 3 partial to 13
readable. Performance and overview wait for wave 3. Notifications and
config/admin are out of scope (owner question 185 in that doc, default applied).

Code: `apps/api/src/branches/sales/assistant/record-kinds-read.ts`,
`record-read-kit.ts`, `search-read.ts`, `list-my-work.ts`,
`list-my-work-extra.ts`, `shrink-rows.ts`,
`apps/api/src/platform/assistant/assistant-loop.ts`,
`assistant-turn-read.ts`, `assistant-turns.ts`, `assistant.service.ts`, prompt
v13 (`apps/api/src/platform/ai/prompts/assistant.prompts.ts`), eval
`apps/api/src/scripts/ai-eval/scope-kinds*.ts` and `seed-kinds.ts`, web
`apps/web/src/components/assistant-conversation.tsx` and
`apps/web/src/data/assistant-copy.ts`.
Gate 0 is still OPEN: nothing here was tried against a live model.

## Decision

### 1 · `get_record` gains contact, campaign and workstream

Codes CT-, CP-, WS-. Each is read through its screen's profile door, so the
asker sees what the screen shows. `search_records` defaults to six kinds, not
seven: no workstream, because the search door has none.

- The re-check of a stored answer goes per code through the profile door; none of
  the three books takes `codes`.
- A contact's phone and email appear only with a live `data.export` (ADR 0134 §4).
- A campaign returns counts, never the member list.
- A workstream carries no money.

### 2 · Search by phone or email

An asker without a live `data.export` does not search the `contact` kind at all;
holders search six kinds. The search door ranks contacts by phone and email, and
a post-filter on the best-matching field dropped legitimate name hits, so the
kind is left out instead of filtered.

### 2b · What a read stores as codes

- The company (account) read carries no contact codes. The contact door's scope
  (lead owner) is narrower than the lead book's (owner or nurturing pool), so a
  stored contact code would withhold the chat on reload for an own-only seller.
- A workstream read stores only its own WS- code. Its lead, deals and contracts
  come as rung/outcome/dates with no codes: the journey admits a contract's
  closer/collector, whom the lead and deal books do not, so their codes would
  withhold the chat on reload.

### 3 · `list_my_work` kinds

An absent `kind` is the desk as before (lead, opportunity, next-step). Three
kinds are read only when named:

- `approval`: waiting on me, or raised by me.
- `parked`: the asker's own holds. Nurturing leads are a shared pool with no
  holder, and deals have no nurturing state, so neither is listed.
- `meeting`: today only; time and remaining count, no subject code, no title.

Because they are read only when named, stored counts rebuild from kind + row
count with no migration. Approval links carry kind and label only, no code: the
approval door needs only a session, and re-checking link codes through the
stricter books would withhold whole chats on reload.

### 4 · Over-budget results are shrunk, not dropped

The tool drops rows from the end and cuts history summaries to 300 characters,
and sets `truncated: true`. Codes stay a superset: the audit over-counts and the
re-check is stricter. Prompt v13 tells the model to say a truncated result is
partial.

### 5 · Footer counts

Counts per kind come from the `readsOf` and `refsCounted` hooks, identical live
and on replay.

### 6 · "Phân tích kỹ" is a person's switch

Default of owner question 184. It routes the turn to `assistant-deep`, needs both
the `assistant` and `assistant-deep` routes on, and is shown only when available.
The deep route is seeded OFF (migration 0159) and its primary model is Opus.
Turning it on is the owner's call, with cost in mind.

## Consequences

Known limits:

- A contact is opened by its CT- code only when the person gives one (or from
  search, for `data.export` holders, via its lead).
- Per-code re-check for the three new kinds is uncapped beyond the existing chat
  cap: a long chat can cost many profile reads.
- The model cannot drill from a journey to its deals or contracts by code,
  because the workstream read stores none.
- Workstream EN/KO names differ across screens.
- Gate 0 is unchanged from 0142.
- Remaining debt: `docs/status.md`.
