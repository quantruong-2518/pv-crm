# 0040 · Seven MAS mail data-model decisions — `mail_run` is the send unit, `campaign_run` is a link

Status: accepted
Source: docs/ban-giao-mas-mail.md — table "Bảy quyết định đã chốt"

## Context

Building bulk send (MAS mail) on top of the transactional mail infrastructure
from ADR 0010, answering the project owner's four minimum needs locked in
28/08: send from the lead book, send from lead detail through the same
stepper modal, send multi-wave campaigns with an accurate schedule, and
measure opens/bounces per wave.

## Decision

| #   | Decision                                                                      | Reason                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The send unit is `platform.mail_run`**, not `sales.campaign_run`            | `email_delivery` lives in `platform` and needs a foreign key to whatever groups it. Pointing at a `sales` table would reverse the one dependency direction the repo holds tightest. `tsc` catches this — DDL does not                                                 |
| 2   | `sales.campaign_run` is only a **link** between campaign and `mail_run`       | It points `sales → platform`, the allowed direction. Quick MAS has no row here at all                                                                                                                                                                                 |
| 3   | **Every send creates a `mail_run`**, including Quick MAS                      | The timeline on lead detail reads exactly one table. Two sources answering the same question drift apart within a quarter                                                                                                                                             |
| 4   | **`mail_event` is separate; open/click never touch `email_delivery.state`**   | The `advances()` ladder answers "did the letter arrive". Opens answer a different, much weaker question. Merging them would break the ladder and let a soft signal override a hard one. `mail-webhook.controller.ts:65` already refuses this                          |
| 5   | **Content is snapshotted on `mail_run`; merge variables live on each row**    | Editing a template must not rewrite a letter already sent last week. `merge` has to sit on the row because the composer in `platform` cannot read `sales.lead` — the Sales branch fills it in at enqueue time                                                         |
| 6   | **Two send permissions, not one**                                             | `lead.send-email` carries `ownOnly` (a Sale sends only their own leads); `campaign.broadcast` fires the whole audience, multiple waves. Merging them means either a Sale can broadcast a campaign, or the button on the lead book stays grey forever for Sales and BD |
| 7   | **`satisfies Record<…, true>` for CHECK value lists, not reading `.options`** | `drizzle-kit generate` loads `*.schema.ts` through its own CJS loader, and the ESM barrel of `@pv/contracts` does not survive it — a value import comes back `undefined`. See the friction log in the source file, item 1                                             |

## Consequences

Decision #7 generalizes past this module: any `*.schema.ts` file that needs an
enum's value list for a `CHECK` constraint must inline the list and pin it
with `satisfies Record<Enum, true>` so a missing or extra value is a compile
error — importing the value straight from `@pv/contracts` breaks
`drizzle-kit generate`.
