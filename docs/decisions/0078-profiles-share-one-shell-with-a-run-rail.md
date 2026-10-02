# 0078 · Every profile screen shares one shell: a run strip, a header, a body that puts the work first, a run rail and a floating contact bar

Status: accepted (replaces 0077 §6 where it puts history only in the workstream drawer and the primary move in the floating bar; 0077's one-place-per-fact rule stands)
Source: project owner's decisions, design review of the profile screens, 02/10/2026

## Context

The business is run-centred: one lead, n deals, n contracts, comms gathered by
workstream (0062, 0075). The screens were object-centred, and each redrew its own
slice of the run. The detail screens drifted into several header styles, several
places for state, several action bars (sticky, floating with a hand-set spacer,
a header button, a drawer only), and three copies of the comms list. The list
books were unified the same way earlier in `apps/web/src/components/book-page.tsx`.

## Decision

### 1 · One shell

Lead, opportunity, contract and workstream profiles share one shell. Campaign,
account and contact use it without the run parts (no run strip, no run rail,
only their own rail). A company's rail is the list of its runs.

- **Run strip.** Company · workstream code · Lead → Cơ hội → Hợp đồng → Sau bán →
  Tăng trưởng, linking the run's objects. Sau bán and Tăng trưởng show an empty
  place only: they have no book yet.
- **Header.** Title and one meta line (code, owner, source, date). No
  object-type kicker. No status pill when the screen shows a stepper.
- **Body**, in fixed order: "Việc cần làm" (rungs with their dates, the next
  step and the primary action from the server's verdicts) → working content →
  reference, set lighter.
- **Run rail.** Liên hệ, Người liên hệ, Tệp: one copy each, each fed by the
  workstream code or `{ kind, code }`.
- **Floating bar.** Only Gọi / Zalo / Gửi mail and "Khác". The shell owns the
  spacer, the skeleton and the error state; a screen passes content, not
  geometry.

### 2 · What it replaces in 0077 §6

- Comms history is a fixed rail block on every profile, not only in the
  workstream drawer.
- `JourneyDrawer` is retired. The workstream detail screen stays as the run
  overview, on the same shell.
- The primary move leaves the floating bar for the "Việc cần làm" card.
- Gọi / Zalo / Gửi mail still live only in the floating bar (0077 §6 stands).

### 3 · Decisions

- The email list merges into Liên hệ, with a channel filter.
- A lead's activity history folds into the dates on its state stepper; the
  reason for a stop or a park shows on that rung.
- Tablet and phone stack the rail under the body, with the bar docked at the
  bottom.
- No primary button is drawn without a server verdict (0076 §4). A lead for a
  Sale with no verdict gets none; a contract gets none until its per-rung actions
  are decided (Postsale scope, not yet decided).

## Open

- The contract's primary action per rung (Postsale scope, undecided).
- A lead's primary action for a Sale.

## Amends

- **0077 §6** — see §2 here.

## Out of scope

- Any change to business rules, states or labels fixed in 0058–0077: this
  rearranges screens, it does not change behaviour.
- Blocks for Sau bán and Tăng trưởng.
