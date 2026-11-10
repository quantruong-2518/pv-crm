# 0145 · Four low-weight KPI bells become one morning digest

Status: accepted
Source: project owner's choices in chat, 10/11/2026 (after a review of KPI against modern CRMs).

## Context

KPI has about 20 bell kinds. `kpi-about-to-miss`, `kpi-about-to-hit`, `kpi-counter-proposed` and
`kpi-counter-resolved` are already "not important" (no toast) but each adds an unread line. There is no web push;
"instant" means the SSE row.

## Decision

Important KPI bells stay instant. Those four are summed into one line per person each morning at 08:00 Vietnam time.

## Defaults that are not the owner's

1. The four are still written to `platform.notification`, marked read at insert: history and links are kept, the
   unread count is unaffected.
2. New kind `kpi-digest`, not important, one per recipient per Vietnam day (event key `kpi-digest/<recipient>/<YYYY-MM-DD>`).
   Window: lines created before today's 08:00 Vietnam and at or after the 08:00 cut of the previous digest's day
   (fallback 24 h before today's cut). Lines after 08:00 wait for tomorrow. Sent only when the window holds at least
   one digested line.
3. Counts per kind go in `detail`. The link reuses the subject of the newest digested line by priority
   counter-proposed > counter-resolved > forecast.
4. Runs every day including weekends. Amended 10/11/2026: see "Amended 10/11/2026" below.
5. A sweeper on the worker tick that fires once the Vietnam hour is 8 or later and does not advance its clock on
   failure (avoids the boot-miss of the 24 h throttles). The forecast alert sweep's hour still depends on boot time,
   so a flag can wait until the next morning's digest.
   After a successful pass the sweeper sleeps until tomorrow 08:00; a failed pass retries every 5 minutes (the 5
   minutes is a default, not the owner's).
6. Digested lines are born read, so the 90-day purge of read lines applies to them from creation.
7. A kind is digested only while its effective policy is not "important"; an admin who marks one important gets it
   instant again.
8. Slip/hit counts are metrics, not lines: each line carries its metric count.
9. The digest never depends on its copied link being openable: it rings without a dropped link, with a neutral label.
10. Overlaps the decided-not-built 08:00 morning brief of 0133. Settled 10/11/2026 (open question 174): it stays a
    separate line; see "Amended 10/11/2026".

## Amended 10/11/2026

Owner's answer to open question 174. Default 4 no longer holds: the digest runs Monday to Friday only (Vietnam days).
Monday's digest covers everything since Friday's 08:00 cut. It stays a separate line and is not merged into the morning
brief of 0133 (default 10 settled).
The fallback window (default 2) is now the previous working day's 08:00 cut (Monday looks back to Friday), and both
scans are bounded at 4 days so a missed weekday next to a weekend is still caught up.

## Consequences

- `NOTIFICATION_KINDS_DIGESTED` lists the four kinds.
- Migration 0164 adds the kind to the notification CHECKs.
