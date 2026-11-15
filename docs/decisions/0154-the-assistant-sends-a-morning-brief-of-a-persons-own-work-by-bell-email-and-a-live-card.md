# 0154 · The assistant sends a morning brief of a person's own work by bell and email, and shows the same work live as a card

Status: accepted (amends 0133 §2 and 0152 §3; built on branch, not shipped)
Date: 2026-11-15
Source: wave 2 of the CRM assistant, on branch `assistant-wave-2` (not merged); the owner's six answers of 15/11/2026 on the morning brief

## Context

ADR 0133 §2 promised a morning brief. ADR 0145 already sends a separate KPI digest
at 08:00. This ADR fixes what the brief holds, who reads it, and how it is sent.

## Decision

### 1 · Sections, and what counts as today's work

`MyWorkSection` is `next-step`, `approval`, `meeting`, `parked`, `stale-deal`,
`late-debrief`, `overdue-contract`.

| Section            | Counts as today's work                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `next-step`        | step `dueLevel` is `due`, `overdue` or `long-overdue`                                                    |
| `approval`         | only rows waiting on the asker, not raised by the asker                                                  |
| `meeting`          | every row (the kind already lists today only)                                                            |
| `parked`           | hold `dueLevel` is `due`, `overdue` or `long-overdue`                                                    |
| `stale-deal`       | the asker's open deals as sale or BD (lanes `sale`, `bd`), with `activityFreshness` of `warn` or `alert` |
| `late-debrief`     | the asker's pending debriefs with `late` true                                                            |
| `overdue-contract` | every overdue contract where the asker is owner or collector                                             |

Why: the first four kinds already exist (ADR 0152 §3); the three new ones are the
work the owner asked the brief to surface.

**Counts.** Every item read counts, not the printed slice, so the count and the
list cannot disagree about how much work there is. `more` means the count is a
floor because a read was cut. Approvals waiting on the asker and today's meetings
count as items without a chip, since their doors carry no record code by design.
A late debrief counts one per debrief, with one chip per subject, so two debriefs
on one customer are two items and one chip.

**Section states.** A section the asker cannot open is left out, so the card never
shows a door the person has no right to. A section whose read failed is `skipped`:
the card shows "Không tải được mục này." and the sweeper fails that person, so the
retry builds the brief whole instead of sending one that looks complete and is not.

### 2 · One selector for chat, card and brief

`list_my_work` gains the kinds `stale-deal`, `late-debrief` and `overdue-contract`
and, for every kind, returns the items that count as today's work as a trusted
`workItems` list that never reaches a model. `MyWorkService` calls the tool through
the tool gate, one kind after another, by name, and joins `workItems` to `refs` by
code. The chat tool, `GET /assistant/my-work` and the brief sweeper all use it.

Why: three callers reading three ways would drift. Going through the gate means the
brief obeys the same door checks as the chat; platform names the tool by string and
never imports the branch.

### 3 · The sweeper

`AssistantBriefSweeper` rides the worker tick, on the pattern of the KPI digest
sweeper: Monday to Friday, holidays included (ADR 0134), only inside the window
08:00 to 11:00 Vietnam. A deploy or restart later in the day must not send a
"morning" brief. A person whose pass failed is retried every 5 minutes while the
window is open, and only that person; the others are remembered in memory for the
day. Recipients are the people holding `assistant.use`, the same need as the
assistant chat and the card, handled sequentially, one person at a time. Each
person is read as their own actor, so a manager gets only their own work.

Per person, in order:

1. A bell row for event key `assistant-brief/<recipientId>/<day>` exists: skip, no AI, no mail.
2. No items in any section: send nothing.
3. Ask for AI lines (§4); any failure, refusal, route off or quota means no lines, and the brief goes on.
4. Announce the event `platform.assistant.brief`, bell rule `assistant-brief`, to the recipient, with per-section counts (non-zero only) and `summary` (the AI lines joined by a space; absent when none).
5. Read the bell row back: present, send the email; absent (muted or not written), no email.

Why: the brief goes to the people who can open the assistant, not to every user,
so nobody is sent a bell that opens something they cannot use. The event key makes a rerun idempotent, and the read-back makes the email
follow the bell, so a person who muted the bell gets no email either. Sequential
keeps Neon load flat. Failure of the AI must not cost anyone their list.

### 4 · AI lines

Route `assistant-brief` is turned ON, with `daily_calls_per_user = 1`, by migration
0169 (owner decision 4: on at ship, cap set in the migration).

The route cap counts a rolling 24 h window from the vendor's answer, so at a fixed
08:00 pass it would refuse every other day. The sweeper therefore checks that the
route is on and within its token budget, then calls with the per-user cap bypassed;
the bell row keeps it to one brief a day.

Input is only the trusted fields of today's rows per section, never free text,
names or `refs`. Output is 1 to 3 Vietnamese lines of at most 160 characters. Any
line with a digit is dropped whole: the summary is then absent, the brief goes on.

Why: the model writes no numbers and no codes, because the counts come from the
server and a number written by a model cannot be checked after the fact (ADR 0133).
Free text and names stay out because the model's output goes to a bell line.

### 5 · Email

Counts per section and one button to open the CRM. No customer name, no code, no AI
text. Sent as a transactional mail through `MAIL_PORT`; template
`assistant-brief` in `packages/mail-templates`.

Why: mail leaves the system and cannot be recalled (ADR 0133 §2).

### 6 · Bell and the "Việc hôm nay" card

The new notification kind `assistant-brief`, label "Việc hôm nay" (the same as the
card, so one name for one thing), is grouped with
the person's own work, not with `kpi`. Policy is not important and not locked, so
roles can mute it on `/admin/notifications` like the KPI digest. It is not
digested. The bell line is the count and the `summary` lines; clicking it opens the
Assistant panel. The top of the panel shows a card "Việc hôm nay", read from
`GET /assistant/my-work` every time the panel opens, grouped by section, one ref
chip per item that has a record; an empty card says so. Section names for the
card, the bell and the email come from one ledger, `MY_WORK_SECTION_LABEL` in
`@pv/contracts`, so the three cannot drift. It is never stored as a chat session.

Why: a stored card would go stale by the afternoon and would be rechecked on every
reload (§8).

### 7 · The contract `collector` filter

The contract book query gains `collector`, a comma list of actor ids shaped like
`owner`, with no `OWNER_NONE`. `overdue-contract` reads the book with
`status=overdue` twice, once by `owner` and once by `collector`, and merges by
code. Why: the person who must act on an overdue contract is the owner or the
payment PIC, as in the overdue bell. The book returns one row per contract, so
the brief has one item per contract, not per installment.

### 8 · Stored chat codes

A stored `list_my_work` call keeps its `codes`, and on reload each is rechecked
through a door; a code the door does not reach hides the whole conversation. The
new kinds therefore keep only codes their recheck door reaches for the same asker.
Stale-deal and overdue-contract keep their codes: they are rechecked through the
same book doors that built them, and the contract book admits owner and collector
alike. Late-debrief stores none, since its subject may be outside the asker's lead
or deal reach.

### 9 · The KPI digest stays separate

The `kpi-digest` bell of ADR 0145 is not folded into the brief. The two are
different kinds with their own mute switch.

## Amends

- ADR 0133 §2: the morning brief is built as above.
- ADR 0152 §3: `list_my_work` gains `stale-deal`, `late-debrief` and `overdue-contract`; like the kinds there, they are read only when named.

## Consequences

- Ship order: migration 0169 before the API deploy (the new kind is checked by two database constraints, and the route is switched on there). The brief first fires in the next weekday 08:00 to 11:00 Vietnam window after the deploy.
- Never seen: the card, the bell line and the email have not been looked at in a browser.
- Known limits:
  - A muted person still costs one gather and one AI call per window restart, because the hub has no public "would this ring" read.
  - A failed bell write looks like a mute and is not retried.
  - Next steps are read for at most a fixed number of records per call (the step budget); beyond that the count is a floor.
  - The summary shows only in Vietnamese.
- Tests the owner asked for: each role sees only its own work; the email carries no customer name or code; an AI failure still sends the list; a second sweep the same day sends nothing; zero items sends nothing.
- Remaining debt: `docs/status.md`.
