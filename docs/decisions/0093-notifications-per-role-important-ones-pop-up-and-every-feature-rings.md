# 0093 · Notifications per role: important ones pop up, and every feature rings

Status: accepted 14/10/2026 (amends 0085 §3, §4 and "Not in wave 1"; amends 0089 §2's application on the web)
Source: owner answers of 14/10/2026 after the review of notifications, mail and config — "In config, there is a list of notifications showing which notifications each role sees; important ones pop up by default" and "Make notifications smart for the whole of every feature". Open questions 62 and 63 no longer block; this ADR decides them. The Neon plan is Launch, so Profile A holds and SSE push stays.

## Context

0085 rang every kind for everyone it named, with no switch, and left campaign
and contract events out because their recipient or writer did not exist. 0089
made the bell immediate. The owner now wants a per-role list in config, a
pop-up for what matters, and every feature ringing the right person.

## Decision

### 1 · A per-role policy, which only narrows

- **Table.** `platform.notification_kind_policy`, one row per kind:
  `important boolean` (null = the contract default), `muted_role_ids text[]`,
  `updated_by`, `updated_at`. No row means the defaults from contracts. It stores MUTES, not grants, so a new
  kind reaches everyone until someone mutes it. The opposite, as in
  `role_permission` where no row means denied, would silence every new kind.
- **Where it applies.** In the hub
  (`apps/api/src/platform/notification/notification.hub.ts`), after E4
  `plan()`. A recipient is dropped only when at least one role they hold is
  muted for that kind and every other role is muted or cannot open the kind's
  subject (a union, like permissions). The filter only removes intents, so it
  can never widen past E4 or past permissions. It is read inside the same
  transaction, with no cache, because the worker announces too.
- **Locked kinds** can never be muted: `approval-waiting`, `access-changed`,
  `password-reset-by-admin`, `google-link-broken`. Muting `approval-waiting`
  would silently stall approvals. A write that tries to mute one is refused.
- **Defaults** live in contracts as a map `NOTIFICATION_KIND_POLICY`
  (important, locked) in `packages/contracts/src/notification.ts`, typed over
  every kind like `NOTIFICATION_KIND_GROUP`, so a new kind cannot ship
  unclassified.
- **Importance rule.** Important by default means a PERSONAL audience who must
  act. Role-wide audiences (`pool-watchers` for lead-pooled, `acceptors` for
  opportunity-awaiting-accept) are never important by default, because they
  would pop up on every Sale for every event.
  - Important by default: `approval-waiting`, `lead-received`,
    `customer-replied`, `mail-failed` (1-to-1 letters only, see §4), and the
    reminders in §5 that ask the reader to act (next step overdue, instalment
    overdue).
  - Admins may change importance per kind.

### 2 · Screen and permission

- **Where.** `/admin/notifications`, listed on `/settings` beside "Vai trò"
  (`ADMIN_ENTRIES` in `apps/web/src/app/chrome.tsx`). It is One Core, not
  `/sales/config`: notifications are not Sales-only, and `platform/` cannot use
  the Sales config approval path.
- **Layout.** Kinds grouped by `NOTIFICATION_KIND_GROUP`, one column per role.
  Each cell reads "nhận" or "tắt". A cell reads "không áp dụng" when that role
  lacks the permission needed to open the kind's subject, derived from a
  subject→permission map plus role grants, so a non-technical admin is not
  shown cells that mean nothing. Locked rows cannot be edited. Each kind also
  has a "Quan trọng" switch.
- **Permission and audit.** Gated by `setting.manage` (director and head of
  sales by default). No approval step, because the change can only narrow; this
  matches both precedents, role-permission edits and platform settings. Each
  write is audited in the same transaction with before and after.

### 3 · Important notifications pop up

- **Signals stay empty.** The stream still carries no rows (0089 §2).
- **Snapshot.** On `ready` (first connect, reconnect, tab shown) the web
  refetches and snapshots the ids of the first page WITHOUT toasting.
- **Toast.** On `changed`, after the refetch, a toast fires for ids that are
  not in the snapshot, unread, and of an important kind. At most 3 at a time.
  Each toast has an action "Xem" that opens the notification's target.
- **Diff on ids, not `createdAt`.** One announce shares one timestamp.
- **One tab per notification.** Tabs claim the id over a BroadcastChannel, so
  only one tab shows it. A focus gate would lose toasts while the person is in
  another app.
- **Fallback.** While the stream is not live (polling fallback), nothing
  toasts; the badge still counts.
- **Toast definition.** The docblock of `packages/ui/src/organisms/toast.tsx`
  says a toast is only for a job the user ran. This ADR widens it to "or an
  important notification for you".

### 4 · Smart: collapse bursts

- **Bulk mail.** Letters of a bulk run ring nothing one by one. The run's
  closing line (`mail-run-sent` / `mail-run-cancelled`) carries the failed
  count. This ships in the SAME wave as the toast, or the toast would amplify a
  flood of failure lines.
- **Imports and hand-overs.** One line per recipient per batch: lead import
  owners and re-entries, opportunity import assigned / awaiting-accept. A lead
  hand-over cascade (lead + deals + next steps) rings the new holder once.
- **Mechanism.** The insert stays `ON CONFLICT DO NOTHING`. A collapse means
  ringing once at the end of the batch, as the import's pool line already does.

### 5 · Smart: reminders on the clock, only on thresholds that already exist

- **Runner.** A worker-only hourly reminder sweeper, self-timed like the
  notification purge (`apps/api/src/platform/notification/notification.sweeper.ts`), counting days in Vietnam
  time.
- **Key.** Every reminder keys on row id + level + anchor date, so it rings
  once per crossing and again after a reset.
- **Reminders:**
  - next step due today, and overdue (the step's `due`);
  - instalment due soon / overdue / long overdue (thresholds in
    `packages/engines/src/contract-due.ts`);
  - payment condition and quotation validity ring ON the due or expiry day
    only, with no "ending soon", because no lead time exists;
  - deal stale at the activity alert threshold (`sales.activity.alert-days`);
  - stage overdue past the stage's `limit_days`;
  - opportunity awaiting accept past the `new` stage's `limit_days`;
  - comm record unconfirmed past `COMM_CONFIRM_WITHIN_HOURS`
    (`packages/contracts/src/comms/thread.ts`);
  - lead first touch, only where an admin has set `firstTouchMinutes` on the
    lead's motion.
- **Not built.** The lead TIER ladder has no number on purpose, so it gets no
  reminder.
- **Defaults, not owner decisions:**
  - "First touch" = the first touch or activity a PERSON records on the lead
    after it is created.
  - In config section 5.9 only `firstTouchMinutes` is wired. The other three
    fields (receiving role, cold mail allowed, self-filled form counts) are
    HIDDEN until assignment rules exist, because no code reads them today.

### 6 · Smart: every feature rings, at the right person

New kinds; audience in brackets; the actor is always excluded.

- **Opportunity:** stage moved [other deal owners]; Sale primary changed [old and new primary]; contract signed, directly or through approval [director, deal
  owners, commission owner].
- **Quotation:** a new round, and the waiting round closed by a new one [other
  deal owners].
- **Contract** (answers q63; the writers now exist, ADR 0090): instalment
  marked paid or undone; schedule replaced; condition done [contract owner and
  the participants who can open the contract].
- **Campaign** (answers q62): campaign stopped; campaign finished. The audience
  is `campaign.owner_id`, an actor since migration 0100, defaulting to the
  creator; nobody when it is null; never a role-wide blast.
- **KPI:** target proposed [holders of `kpi.set-target` minus the proposer];
  target agreed [the proposer].
- **Comms:** a record closed on the owner's behalf [the owner].
- **Lead:** moved to nurturing, resumed or reopened by someone else [the
  holder].
- **Roles:** the role matrix replaced → `access-changed` to the active holders
  of that role.

### 7 · Never tell someone about a thing they cannot open

- **Re-target first.** The lead owner hears that their lead's deal was lost on
  the LEAD, not the deal. The opener of an accepted deal hears it on the lead. A
  scan that failed after its owner lost `lead.edit` rings without a link.
- **Then drop, as a backstop.** The hub drops a recipient whose role grants
  cannot open the subject kind (the same subject→permission map as §2), and
  logs the drop.
- **Scope failures** (`ownOnly`) are solved by re-targeting, not by the hub.
- **Disabled leads** ring nobody.

## Waves

1. §1 + §2 + §3 + §4's bulk-mail collapse.
2. The rest of §4 + §6 + §7.
3. §5.

## What this amends

- **0085 §3** — a role audience is still the permission holders, now narrowed
  by the per-role policy (§1) and the subject→permission backstop (§7).
- **0085 §4** — "No on/off switch, per person or org-wide". An org-wide,
  per-role mute now exists; there is still no per-person switch.
- **0085 "Not in wave 1"** — clock-driven reminders are §5; the campaign and
  contract lines are answered by §6.
- **0089 §2** — unchanged on the wire; the toast (§3) is a diff the web makes
  after its refetch.

## Alternatives rejected

| Alternative                                      | Why not                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Grants instead of mutes                          | No row would mean silence, so every new kind would ring nobody   |
| Policy per person                                | The owner asked per role; per person can come later              |
| Store the policy in `platform.setting`           | Values there are numeric only                                    |
| Route changes through Sales config approval      | Notifications are not Sales-only; the change can only narrow     |
| Rows on the stream                               | A second place for the permission cut and the row mapping (0089) |
| Toast on `ready`                                 | Every reconnect would replay the first page                      |
| A focus gate                                     | Toasts would be lost while the person is in another app          |
| Invented lead times ("quotation ends in 3 days") | No such threshold exists in config                               |
| Ring every `campaign.broadcast` holder           | A role-wide blast for one person's campaign                      |

## Relations

Amends 0085 and 0089. Builds on 0082 (KPI targets), 0090 (contract writers),
0091 (direct signing), 0075 (comm confirmation deadline). Mirrors E2:
permissions are a union, and so are mutes.

## Consequences and known limits

- Wave 2 rulings (owner, 15/10/2026): customer replies to letters of a BULK
  run collapse into one `mail-run-replied` line per run, per recipient, per
  Vietnam day (later replies that day are absorbed by the event key and the
  line shows no count; 1-to-1 letters keep `customer-replied`). One act rings
  one line: accepting a deal rings `opportunity-accepted` only, a first
  quotation `opportunity-stage-moved` only, a superseding round
  `quotation-superseded` only, a stop `opportunity-lost` only. `contract-signed`
  lands on the deal, because some deal owners cannot open the contract.
- An import or hand-over of one item keeps today's per-item line; several
  become one line per recipient on a `lead-batch` / `opportunity-batch`
  subject with a count. A lead hand-over rings the new and the previous holder
  once each, carrying the number of deals that moved.
- Kinds that ring even when the reader cannot open the subject (no link):
  `lead-scan-failed`, `lead-removed`, `opportunity-unassigned`,
  `mail-run-replied`. Every other line is dropped, and logged, for a recipient
  whose roles cannot open its subject.
- Known gaps: scan batches still re-enter leads one line each; a payment
  schedule saved unchanged still rings; `kpi-target` lines open the company
  KPI screen (`performance.view`), so a role given `kpi.set-target` without it
  hears nothing.

- The §5 defaults (first touch, the hidden 5.9 fields) were the assistant's;
  the owner accepted them on 14/10/2026.
- A role counts as "not applicable" for a kind when it cannot open ANY of the
  kind's subjects (`NOTIFICATION_KIND_SUBJECTS` × `NOTIFICATION_SUBJECT_PERMISSION`
  × role grants). The grid cannot mute it, and the hub does not let it keep a
  line alive: a person is dropped when at least one role is muted and every
  role is muted or not applicable.
- `important` is stored only when it differs from the contract default
  (`null` = follow the default), so muting a kind never freezes its importance.
- Locked kinds refuse mutes; their importance may still change.
- A bulk run ends with one closing line carrying the count of letters that did
  not arrive (bounced, failed, dead). A run a person cancels rings its creator
  only when letters were already lost, so stopping unsent waves rings nobody.
- Engineering defaults the owner has not confirmed: stream retry after a
  refusal 30 s, doubling, capped at 5 minutes; tab claim wait for a toast
  200 ms (`apps/web/src/data/notification-toasts.ts`). A toast's clock pauses
  while it is hovered or focused.

## Rollout

Wave 1 built and live 15/10/2026 (migration 0106). Wave 2 live 15/10/2026
(migration `0110_notification_wave2`, first run on Neon as 0107 before the
merge with ADR 0094-0096 renumbered it; it restates every kind so either
order ends with the full lists). Wave 3 not started.
