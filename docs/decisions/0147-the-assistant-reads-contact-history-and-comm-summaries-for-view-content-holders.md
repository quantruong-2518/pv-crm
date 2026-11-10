# 0147 · The assistant reads contact history and comm summaries for holders of `comm.view-content`, and never a transcript

Status: accepted (amends 0133: history read, optional doors, eval checks)
Date: 2026-11-10
Source: project owner's decision in session, 10/11/2026: the assistant may read comm summaries for a seat holding `comm.view-content`, exactly as the screen does

## Context

Slice 2 of the series opened by 0142. It answers when a lead or deal was last
contacted, what was agreed, and the next step. Tool `get_history`
(`apps/api/src/branches/sales/assistant/get-history.ts`), prompt v9 (v8 until the 10/11/2026
replay-fence amendment)
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

## Amendment 10/11/2026 · a stored answer that may quote a summary is hidden from a reader without `comm.view-content`

Owner decision ("flag and hide"): closes the known limit "a stored answer
quoting summary text".

- A tool declares the permission its revealed text needs (`reveals`;
  `get_history` declares `comm.view-content`) and flags a call when text behind
  it reached the model (`get_history`: a comm row inside the cut with a visible
  summary). The flag is stored on `platform.assistant_tool_call.reveals_content`
  (migration 0165, additive: migrate before deploy).
- A tool that declares `reveals` but omits the flag counts as revealing. A
  flagged call whose tool is gone, or declares nothing, fails closed.
- Every re-read re-checks: chat reload (`detail`), the report list (`reports`),
  model replay and the session-summary fold. A reader lacking the permission
  gets that answer `withheld`, and every later answer of the same chat too
  (forward taint). The fold never folds past an answer shut for its owner, and
  the replay drops the folded summary when it covers a shut answer; this also
  closes the older limit that the summary of folded turns was not re-checked
  for record codes.
- Backfill: the table stores no output, so every existing ok `get_history` call
  is marked revealing. A role without `comm.view-content` (marketing by default)
  loses, in its own old chats, every answer from its first `get_history` call
  on, even if no summary reached the model.

Code: `apps/api/src/platform/assistant/`, `apps/api/src/branches/sales/assistant/`.
Remaining debt: `docs/status.md`.

## Amendment 10/11/2026 (second) · replay fence, reach re-check, audit on re-serve

Owner decisions of 10/11/2026. Supersedes the known limit "History replays past
answers as plain text outside the delimiter" of 0133 §7.

1. **Replay fence.** Replayed past assistant answers go to the model inside a
   per-session fence: `SUMMARY-<sessionId>` marker lines around a JSON
   `{answer}` (`chatFence` in `apps/api/src/platform/assistant/assistant-context.ts`).
   The prompt is v9 (`apps/api/src/platform/ai/prompts/assistant.prompts.ts`).
2. **Reach re-check.** Re-serving a stored answer whose chat revealed summary
   text needs all of: the tool's `reveals` permission; the comms door's own need
   (`comm.view`), via `revealReach.door`; the record still in reach
   (`DebriefService.reachable` in `apps/api/src/platform/comms/debrief.service.ts`:
   E2 view per mirror row, no summary loaded, no audit). Out of reach, or a
   revealing call with empty codes: `withheld` (forward taint). The reach read
   fails or throws: `unchecked`. Verdicts in
   `apps/api/src/platform/assistant/assistant-refs.ts`; registration in
   `apps/api/src/branches/sales/assistant/get-history.ts`.
3. **Audit on re-serve.** Re-serving such an answer writes one `view` line per
   revealing code. `detail` writes notes `assistant · session <id> · …`;
   `reports` writes a page line `assistant.reports · page N` plus code lines
   `assistant · page N`. No lines are written for shut answers, or while a turn
   runs. Over-count is known and safe: the web refetches sessions after each
   turn, and failed answers that made a revealing call are audited too.
4. **Sibling contact (OP-6008).** The tool may show the other seller's contact on
   a deal, as the deal screen does. Eval check `siblingContact`
   (`apps/api/src/scripts/ai-eval/scope-matrix.ts`) now asserts this, where it
   used to print a FINDING.
5. **Backfill consequence (owner to acknowledge).** Migration 0165 marked every
   ok `get_history` call as revealing, including calls where comms was skipped.
   With (2), a co-owner or carer outside the comms single-owner reach now loses
   every older answer from their first `get_history` on, even when nothing was
   revealed. This is the safe direction and is kept.

Eval: `scope-history-reach.ts`, `scope-history-audit.ts`, `runner-audit.ts` and
`scope-matrix.ts` in `apps/api/src/scripts/ai-eval/`. Remaining debt:
`docs/status.md`.

## Known limits

Listed as debt in `docs/status.md`: tool-token cap on a history read; door-side
audit over-count; ref chip label; the debt left by the 10/11/2026 amendment.

## Consequences

- Next slices: quotations and after-sale; then aggregate and KPI questions.
- Gate 0 command is unchanged from 0142.
