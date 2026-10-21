# 0109 · One nurturing list for every failed lead, deal and contract

Status: accepted (supersedes parts of 0057, 0068, 0069, 0088, 0097 and 0107 — exact paragraphs under "Supersedes"; answers open question 104)
Source: project owner's decisions in chat, 21/10/2026, one question each

## Context

A failed lead could end in two places: "Nhóm chờ chăm sóc" (`nurturing`, with a
holder) or "Ngừng chăm sóc" (`disqualified`, reopened by hand). Two doors, two
reopen paths, a "Lead này đi đâu?" choice on every deal stop, and a campaign-end
re-park. The owner ruled for one list. This record is the decisions, not the
implementation.

## Decision

### 1 · Model

- One list, "Nhóm chờ chăm sóc". The lead state `disqualified` ("Ngừng chăm
  sóc") is retired; every failed lead is `nurturing`.
- `nurturing` is a shared pool: no holder, always. Parking releases the holder;
  the touch trail keeps who held it.
- `nurturing` always carries a park reason and the moment it was parked;
  leaving it clears both.
- "Vô hiệu hoá" is unchanged: the only exit with no way back, for junk.
- "Tạm hoãn" is unchanged, except a nurturing lead cannot be held: a hold needs
  a holder.
- A nurturing lead is no longer "gone": it can be mailed, joined to a campaign,
  open a deal and have its tier edited.

### 2 · Ways in

- **One park door** replaces exit and nurture. From new, assigned, verifying,
  working, or converted with no open deal and no live contract. Permission
  `lead.disqualify`, relabelled "Chuyển lead vào Nhóm chờ chăm sóc"; scoped, so
  an own-only actor parks only their own leads. Reason required, labels may be
  attached in the same dialog.
- Ending a hold toward waiting is the same park and also needs
  `lead.disqualify`.
- **Last live deal stopped with nothing signed**: the lead parks by itself,
  reason EX-08 "Cơ hội bị dừng". The "Lead này đi đâu?" choice is gone; the
  stop dialog prints one hint line.
- **Contract terminated** (0107) leaving no live contract and no open deal: the
  lead parks by itself, reason EX-09 "Hợp đồng bị chấm dứt".
- The two automatic parks are the system's act: no permission check, no scope,
  and they are written even when the reason is switched off in config.
- Every park drops the open next step, ends open holds, withholds pending mail,
  cancels future meetings and closes a no-deal run lost. The former holder is
  told, unless they are the actor.
- The doors "Ngừng chăm sóc" and "Mở lại lead" are removed; old touches stay
  readable.

### 3 · Ways out

- **"Nhận lead"**: the caller becomes the holder; the state is the rung the
  trail proves, floor `assigned`. Permission `lead.edit`, scoped.
- **Campaign response**: a customer reply moves the lead to `new` (the pool),
  and the assigners are told. Mail sent to the lead is no longer a response: a
  mail sent never moves a nurturing lead. Hand-logged comms and held meetings
  move only the holder's own lead, so a person presses "Nhận lead" first.
- **Opening a deal** on a nurturing lead stays allowed (0088 §17); the opener
  becomes the holder.
- Changing the owner of a nurturing lead, or marking it contacted, is refused
  with "Lead đang ở Nhóm chờ chăm sóc. Bấm Nhận lead để chăm lại."
- A campaign's end no longer parks the silent (0097 §6 removed); silent leads
  never left nurturing.

### 4 · Scope

An own-only actor sees their own leads and every nurturing lead: the pool is
shared. Pool leads in `new` stay invisible to them. Seeing is not holding: the
claim ("Nhận lead") is the only write an own-only actor may make on a pool lead.
Every other door — profile, contacts, meetings, labels, a single letter, a hold,
a park — needs the claim first.

### 5 · The page

"Nhóm chờ chăm sóc" at `/sales/nurturing`, beside "Tạm hoãn", with three tabs
that reuse the existing lists: leads parked, deals stopped, contracts
terminated. A tab is hidden from someone who cannot view that kind. The lead
book keeps Tất cả · Thành cơ hội · Đang hoạt động · Tạm hoãn; a nurturing lead
shows in Tất cả only. The overview's exit and contract-group links point at the
page.

### 6 · Retired

State `disqualified`; the exit and reopen doors and the notifications
`lead-stopped` and `lead-reopened`; the stop dialog's lead choice; the C5
campaign-end park and the per-member flag that served it; the "gone" branches
(mail block, campaign join, deal opening, tier edit).

## Supersedes

- **0057 §2** — the exit/reopen pair.
- **0068 §4 and 0069 §3** — where a lost deal sends the lead back with a holder.
- **0088 §4** — two separate care lists. **0088 §5 still holds**: no deadline,
  labels as a config list.
- **0097 §1–2** — a park needs a holder; the "Lead này đi đâu?" choice. **§3 in
  part** — no hold on a nurturing lead. **§6** — the campaign-end park.
- **0107, out of scope** — the lead no longer stays converted after
  termination.
- The 15/10/2026 ruling on "Lead này đi đâu?" (0097 §2).

## Consequences

- EX-08 and EX-09 also appear in the manual reason picker.
- The overview's lead-exit count now includes leads parked because a deal
  stopped or a contract ended; they also count in the deal and contract groups.
- Closing every no-deal nurturing run lost moves the overview run counts once,
  at migration.
- No backfill: leads whose contract was already terminated before the migration
  stay converted.
- Do-not-contact lives only on deal loss reasons; removing the gone block makes
  formerly disqualified leads mailable. Owner item 23: warn only.
- EX-08 and EX-09 ids must be checked free on Neon before migrating.
- A customer's auto-reply counts as a reply (question 109).

## Open

Questions 107–109 in `open-questions.md`.
