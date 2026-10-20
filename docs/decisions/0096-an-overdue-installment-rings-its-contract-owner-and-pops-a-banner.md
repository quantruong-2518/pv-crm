# 0096 · An overdue installment rings its contract owner and pops a banner

Status: accepted (builds the "instalment overdue" reminder of 0093 §5; amends 0093 §3 for one kind and 0085 §6)
Source: the reminder is 0093 §5, whose defaults the owner accepted 14/10/2026. The code was written 13/10/2026 and left uncommitted with no ADR; it was ported onto 0093–0095 on 15/10/2026.

## Context

0090 gave every signed contract a schedule with due dates and paid marks, and
the contract book counts the money that is late. Nobody was told when an
installment slipped. 0093 §5 lists "instalment overdue" among the clock
reminders and §1 names it important by default; wave 3 had not started.

## Decision

### 1 · One bell line per installment and due day

Kind `contract-installment-overdue`, subject kind `contract` (code = contract
code), new group `contract` ("Hợp đồng"). An hourly sweeper
(`apps/api/src/branches/sales/contract/contract-overdue.sweeper.ts`) on the
worker's tick (ADR 0082 §2); only the worker runs it (amended 20/10/2026).

- **What rings.** An unpaid installment with `due < now()` on a live lead
  (`ContractRepository.overdueUntold`), kept only when `dueLevelOf` in
  `packages/engines/src/contract-due.ts` says `overdue` or `long-overdue`: the
  same ladder the screen paints.
- **Who.** The contract owner (`contract.owner_id`), when that actor is unlocked.
- **Key.** `<kind>/<contract>/<no>/<due day>`: 0093 §5's anchor date, so a due
  date moved by a schedule edit rings again once the new day passes. Paid, then
  undone on the same due date, does not ring twice.
- **Path.** E4 rule `CONTRACT_INSTALLMENT_OVERDUE`, then the hub. `detail`
  carries the installment number, amount and due date.
- **No `told()`.** `NotificationHub.told` answers per subject, and one contract
  has several installments. The sweeper anti-joins on (recipient, event key)
  instead; the ledger's UNIQUE still refuses any duplicate.

### 2 · Policy under 0093

Important, not locked: a personal audience asked to act, as 0093 §1 says. A
`contract` subject opens with `contract.view`.

### 3 · The line is never purged

The 90-day purge skips this kind (`DURABLE_KINDS` in
`apps/api/src/platform/notification/notification.repository.ts`). The row is
what keeps the sweeper from ringing the same unpaid installment again.

### 4 · A banner instead of a toast

`ActionBanner` (O-09, `packages/ui/src/organisms/action-banner.tsx`) stands at
the bottom centre and never closes by itself. Its one action, "Xem đợt thanh
toán", marks the row read and opens the installment page; the close button
leaves the row unread in the bell.

`apps/web/src/data/contract-overdue-banner.ts` feeds it from the bell's first
page: unread, important, openable by the reader, and not yet shown in this
browser. One at a time. Unlike the toast it also shows a row that landed while
the reader was away. This kind does not toast, so one fact pops once. With
"Quan trọng" switched off on `/admin/notifications`, neither pops.

## What this amends

- **0093 §3** — one important kind pops as a banner, not a toast.
- **0093 §5** — the overdue reminder is built; "due soon" and "long overdue" are not.
- **0085 §6** — subjects are of ten kinds, `contract` added.

## Alternatives rejected

| Alternative                          | Why not                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| Reuse `told()` keyed on the contract | The second installment of a contract would never ring             |
| Key without the due day              | A due date moved by a schedule edit would never ring again        |
| Toast and banner both                | Two pop-ups for one fact                                          |
| Purge the line like any other        | A still-unpaid installment would ring again 90 days after reading |

## Consequences and known limits

- The first deploy rings every installment already overdue and unpaid; the
  banner then shows them one after another.
- No second line when an installment turns long overdue (+15 days), and no
  "due soon" line.
- Days are counted on UTC calendar dates (`daysUntil`), as the screen does, not
  in Vietnam time as 0093 §5 asks.
- A contract with no owner, or a locked one, rings nobody. A new owner is rung
  for an installment the previous owner was already told about.
- "Already shown" lives in one browser: another device pops the row once more.
- Laws 12 and 13 on the banner, and its overlap with a toast on a phone, have
  not been checked in a browser.

## Rollout

Migration `0109` widens the kind and subject lists on `platform.notification`
and the kind list on `notification_kind_policy`. Migrate Neon, deploy the API,
then push the web: the old build never writes the kind.
