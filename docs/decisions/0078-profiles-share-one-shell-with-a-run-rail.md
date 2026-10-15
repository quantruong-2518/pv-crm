# 0078 · Every profile screen shares one shell: a run strip, a header, a body that puts the work first, a run rail and a floating contact bar

Status: accepted (replaces 0077 §6 where it puts history only in the workstream drawer and the primary move in the floating bar; 0077's one-place-per-fact rule stands); amended in place 14/10/2026 — §1 Header and Body, §2, new Amendment 14/10/2026 (items 1–9)
Source: project owner's decisions, design review of the profile screens, 02/10/2026; 14/10/2026: review of the deal profile redesign canvas

## Context

The business is run-centred: one lead, n deals, n contracts, comms gathered by
workstream (0062, 0075). The screens were object-centred, and each redrew its own
slice of the run. The detail screens drifted into several header styles, several
places for state, several action bars (sticky, floating with a hand-set spacer,
a header button, a drawer only), and three copies of the comms list. The list
books were unified the same way earlier in `apps/web/src/components/book-page.tsx`.

## Decision

### 1 · One shell

Amended by ADR 0081: the floating bar also holds Telegram and WhatsApp.

Lead, opportunity, contract and workstream profiles share one shell. Campaign,
account and contact use it without the run parts (no run strip, no run rail,
only their own rail). A company's rail is the list of its runs.

- **Run strip.** Company · workstream code · Lead → Cơ hội → Hợp đồng → Sau bán →
  Tăng trưởng, linking the run's objects. Sau bán and Tăng trưởng show an empty
  place only: they have no book yet.
- **Header.** Title and one meta line (code, owner, source, date). No
  object-type kicker. ~~No status pill when the screen shows a stepper.~~ [Superseded 14/10/2026: the
  status Badge stays in the title on every profile (law 16).]
  Amended 14/10/2026: the primary moves now sit here, right of the title; the
  deal header drops its meta line. See Amendment 14/10/2026.
- **Body**, in fixed order: "Việc cần làm" (rungs with their dates, the next
  step and ~~the primary action from the server's verdicts~~ [superseded
  14/10/2026: the primary action moved to the header]) → working content →
  reference, set lighter.
- **Run rail.** Liên hệ, Người liên hệ, Tệp: one copy each, each fed by the
  workstream code or `{ kind, code }`.
- **Floating bar.** Only Gọi / Zalo / Gửi mail and "Khác". The shell owns the
  spacer, the skeleton and the error state; a screen passes content, not
  geometry.

### 2 · What it replaces in 0077 §6

Amended by ADR 0081: the floating bar also holds Telegram and WhatsApp.

- Comms history is a fixed rail block on every profile, not only in the
  workstream drawer.
- `JourneyDrawer` is retired. The workstream detail screen stays as the run
  overview, on the same shell.
- The primary move leaves the floating bar for the "Việc cần làm" card.
  [Superseded 14/10/2026: it lives in the profile header, not in the card.]
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

## Amendment 14/10/2026

Owner decision, made while reviewing a redesign canvas of the deal profile.

1. The rule that the record's primary moves live only in the "Việc cần làm"
   card is reversed for every record profile (lead, deal, contract,
   installment, company, contact…): the primary moves sit in the profile
   header, right of the title. `RecordHeader` gains an `actions` slot for them.
   The verdict rule stays: no button without a server verdict (§3).
2. The "Việc cần làm" ladder becomes a connected stepper with no card behind
   it. The next step, when there is one, is a compact one-row card under it. A
   won deal shows no next-step card.
3. The deal header drops its meta line of pills (the owner asked to remove
   it); only the plain name-and-tag line of item 7 stays. Other profiles keep
   theirs for now.
4. Rollout: the shared shell and the deal profile first, the other profiles
   follow. Planned, not decided in detail here: the money and contract block
   (a carousel of contract cards, installment tiles), the quotation list in
   the rail, a meeting row on the contact dock.
5. The status Badge stays in the title on every profile, deal included: law 16
   (`docs/design-system/laws.md`) wins over §1's "no status pill when the
   screen shows a stepper". The stepper no longer names the state as a pill.
6. The deal header shows its code in the title (owner-approved design). This is
   the accepted exception to "the strip already shows the code".
7. Owner ruling 15/10/2026: the deal header keeps the deal name and the
   new/returning customer tag (0076 §3) as one plain muted text line under the
   title, e.g. "Triển khai ERP · Khách mới". The created date and the lead
   source are dropped from the deal header. 0076 §3's "on the profile" still
   holds.
8. One door per action (0077 §6, principle 5). When the deal has no seller,
   "Giao Sale" lives in the header and the rail door is not drawn. Swapping the
   seller stays on the rail door and leaves the "Khác" menu.
9. Also amended by this: 0079 §2 and §3, marked there.

## Open

- The contract's primary action per rung (Postsale scope, undecided).
- A lead's primary action for a Sale.

## Amends

- **0077 §6** — see §2 here.
- **0079 §2 and §3** — see Amendment 14/10/2026, item 9.

## Out of scope

- Any change to business rules, states or labels fixed in 0058–0077: this
  rearranges screens, it does not change behaviour.
- Blocks for Sau bán and Tăng trưởng.
