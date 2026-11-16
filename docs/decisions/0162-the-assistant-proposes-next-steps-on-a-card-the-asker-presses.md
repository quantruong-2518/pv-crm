# 0162 · The assistant proposes next steps on a card the asker presses, and the press writes through the step door as the presser

Status: accepted (built 16/11/2026 on branch `assistant-wave-4`, not shipped; prompt v17 never run live, gate 0 OPEN)
Date: 2026-11-16
Source: wave 4 of the CRM assistant ("làm hộ"), owner answers of 16/11/2026 to the six questions of `.claude/HANDOFF-assistant-wave-4.md`; ADR 0133 §1–3

## Context

ADR 0133 fixed the shape: the model never calls a write door. It builds a
proposal card; a person presses it and the write runs through the door the
screen uses, as that person (law 9, `AiActionProps.basis`). The next step of a
lead or a deal is the smallest write a seller does every day, it needs no
approval, and its two doors already exist (`NextStepController`,
`NextStepOpportunityController`).

Owner answers, 16/11/2026:

1. First batch: the next step only — set one, move its due day, mark it done
   (optionally with the following step), on leads and deals. No approval-bound
   write, no bulk card.
2. Every role gets cards, gated by the write need of the step door
   (`lead.edit` / `opportunity.edit`, scoped).
3. Undo only where the screen has it. The step screen has none, so no card does.
4. Mark in both places: the record's history and the assistant ledger.

My calls, not asked: a card lives in a new table, can be pressed for 30
minutes and is kept with its session (90 days, ADR 0133); a card is covered by
"Báo câu trả lời sai" under the same 15 % bar as answers.

## Decision

### 1 · `propose_next_step`

Input, `.strict()`: `kind` (`lead` | `opportunity`), `code`, `action`
(`set` | `done`), `text?`, `due?`, `templateId?`, `reason` (≤ 200 chars).
`set` needs `text` and `due`, plus a `templateId` where the state allows no free
text, as the door's body does; moving a due day is `set`
with the current text. `done` closes the step standing now; `text` + `due`, when
given, become the following step. No person id: the doer is the record's holder,
as the door does when `doerId` is absent, so the `lead.assign` branch never runs.

Door per kind: `NextStepController.set` / `NextStepOpportunityController.set`.
The gate asks that door's `@Need` before the tool runs, so a role without the
edit right gets a refusal and no card. The run then reads the step and the
options through the same service with the asker's `Actor`, which fences scope.
It refuses, with no card: a record the door cannot write (a lead no longer
open, a bought customer's frame); `done` with no step standing; free text where the
state's `freeEntry` is false (the model must pick a `templateId` from options);
a template not in options; text that fails `NextStepSetBody` or holds a link.

At most one card per record and three per turn. The model receives only that a
card is shown; the card itself never enters a model request.

### 2 · The card row

`platform.assistant_proposal`, one row per card: message and tool-call ids
(cascade), owner, subject kind and code, `action` (`next-step-set` |
`next-step-done`), `before` (the step at card time, or null), `after` (the step
the press will write, or null), the door body, `reason`, `state` (`pending` |
`applied` | `dismissed` | `stale`), `expires_at` (created + 30 min),
`decided_at`. Expired is read, not stored: `pending` past `expires_at`.

`before` is a copy of record text, kept because the press compares against it
and a reloaded chat shows it; it is withheld with its answer by the same re-check
that hides refs (ADR 0136), since the record code is in the tool call's `codes`.

### 3 · The press

`POST /assistant/proposals/:id/apply` and `…/dismiss`, under `assistant.use`.
Apply, in order:

1. The row's owner must be the presser, else 404. The reports screen of
   `assistant.review` shows no cards at all, and a press by them is refused here.
2. `pending` and not expired, else 409 naming the state.
3. E2 is asked the step door's `@Need` for the presser now (`needOf`).
4. The branch writes through a hook bound like `ASSISTANT_TOOLS`, in ONE
   transaction: claim the card (`UPDATE … WHERE state = 'pending' AND
expires_at > now()`), lock the record, compare the standing step with
   `before` (`expect` on `StepWrite`, the check `closing` already makes for
   `done`), write, and record the history touch. Only a changed step marks the
   card `stale` (409); any other refusal of the door rolls back, leaves the card
   `pending` and answers the door's own status. Reads through the pool (`reaches`, access) happen
   before the transaction: inside it PGlite waits forever.
5. An audit line `assistant.proposal.applied` names the card and the record.

### 4 · History

A new touch kind `assistant-applied`, written by the press: `by` is the presser,
`note` says what was written ("Trợ lý đề xuất, … bấm: …"). It is a mark, not
activity: every reader that counts touches as work done excludes it.

### 5 · Screen and prompt

The answer shows its cards under the text through `AiAction`: one sentence,
before and after, `reason` as basis, "Làm" and "Bỏ". States after the press are
shown on reload. The event stream gains `proposal`; `AssistantMessage` gains
`proposals`, each with `canPress`.

Prompt v17: propose only when the person asks for a change to a step; never say
the work is done — the card waits for the press.

## Consequences

- A second write door through the assistant needs only a hook entry, a tool and
  an `action` value (a migration, since `action` is a CHECK).
- Cards are not undone; a wrong press is fixed on the screen as today.
- Gate 0 is still OPEN; v17 has never run live.
