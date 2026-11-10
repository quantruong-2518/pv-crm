# 0147 · The assistant reads contact history and comm summaries for holders of `comm.view-content`, and never a transcript

Status: accepted (amends 0133: history read, optional doors, eval checks)
Date: 2026-11-10
Source: project owner's decision in session, 10/11/2026: the assistant may read comm summaries for a seat holding `comm.view-content`, exactly as the screen does

## Context

Slice 2 of the series opened by 0142. It answers when a lead or deal was last
contacted, what was agreed, and the next step. Tool `get_history`
(`apps/api/src/branches/sales/assistant/get-history.ts`), prompt v8
(`apps/api/src/platform/ai/prompts/assistant.prompts.ts`), contract
`GetHistoryInput` and `AssistantHistoryKind` (`packages/contracts/src/assistant.ts`).
Gate 0 is still OPEN.

## Decision

### 1 · Comm summaries: as the screen shows them, for `comm.view-content` holders

The comms door (`DebriefController.list`) trims the summary and writes its own
`view` audit line; the tool passes no `summary` flag. This accepts, for the
assistant, the risk of open question 139 (customer content from comms goes to
Google and Anthropic; cross-border assessment still open).

### 2 · A transcript is never read

Meeting list doors return `transcript` only to `comm.view-content` holders and
audit each serve (d805105d, 0074 §11). The assistant uses
`LeadService.meetingTimeline` / `OpportunityService.meetingTimeline`: the same
fence as `meetingList`, backed by `MeetingService.timeline`. No transcript is
loaded and no "read transcript" audit line is written.
Why: the first version went through `meetingList` and wrote false
transcript-read audit lines; a review caught it and it is fixed in this slice.

### 3 · Main door and optional doors

The main door is touches (`LeadController.touches` /
`OpportunityController.touches`): refused, the whole call is refused. Comms and
the lead and deal meeting lists are optional doors (new `optional` field of the
tool spec in `apps/api/src/platform/assistant/assistant-tools.ts`): a 403 or
404, or an E2-shut door, lands in `trusted.skipped` and the call continues.
Why: the comms door fences on the mirror row's single `ownerId`, narrower than
Sales, so a co-owner or carer it refuses must be told that part is hidden,
never "no history".

Lists are cut to `HISTORY_LIST` with `count` and `more`. Message bodies and
attachments are never read. `DebriefService` is resolved through
`ModuleRef.get(…, { strict: false })` because `CommsModule` exports nothing;
verified on a real `AppModule` boot over PGlite.

### 4 · The eval

The oracle reads optional doors from a table it owns (`OPTIONAL_DOORS` in
`apps/api/src/scripts/ai-eval/scope-door.ts`), not from the tool's
registration, and fails on drift. Per cell
(`scope-history.ts`, `scope-history-audit.ts`, `seed-history.ts`) it checks:
transcript canary absent; no summary text without `comm.view-content`; contact
masking without `data.export`; door-side audit lines (no "read transcript" line
ever, a summary line exactly when the door revealed one). Each new check was
shown to go red against a deliberately broken tool. Cases sit on
`casesExecutive` and `casesMarketing`, none on `casesSale`, which is near its
per-hour turn cap.

## Known limits

Listed as debt in `docs/status.md`: tool-token cap on a history read; door-side
audit over-count; a stored answer quoting summary text; ref chip label.

## Consequences

- Next slices: quotations and after-sale; then aggregate and KPI questions.
- Gate 0 command is unchanged from 0142.
