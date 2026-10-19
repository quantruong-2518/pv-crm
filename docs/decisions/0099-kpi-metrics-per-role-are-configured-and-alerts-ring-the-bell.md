# 0099 · KPI metrics per role are configured, and KPI alerts ring the bell

Status: accepted (completes 0098 §7's deferred bullets on moving the catalog into config and on notification strings; §6's thresholds get a write door)
Source: project owner's decision on the design canvas, 15/10/2026; §4 sweep window and bell weights, §4a, §4b and §6 additions settled in chat the same day

## Context

0098 §7 deferred three things: assigning metrics to roles in the database, a
per-role "who proposes / who approves / acknowledgement deadline" flow, and the
KPI strings through the E4 bell. The owner has now decided the first and third;
the second stays deferred (§6 below).

## Decision

### 1 · The catalog stays in code; configuration is an overlay

The KPI catalog (formula, unit, good direction, daily cadence) stays in code:
it is the shape of the reader that counts the numbers. Configuration is only the
overlay `sales.kpi_role_metric`: switch a metric on or off and pick the primary
metric, per role, within the 14 metrics that exist. An absent row means the
code default. A new metric is not added by configuration.

### 2 · Changing it goes through the existing approval flow

The same flow as the other config lists (0095 §4): who sends and who approves
follows the `config` permissions already in place.

### 3 · The warning thresholds get a write door

`slipRatio` and `hitRatio` are `platform.setting` config (added by 0098 §6) and
now have a write path. The defaults are still the provisional ones of 0098 §6.

### 4 · KPI alerts ring the bell (E4)

Three kinds: a target newly allocated to you; your counter-proposal handled or
returned; about to miss / about to hit. About to miss / about to hit come from a
daily sweep, deduplicated per (month, person, role, metric, flag) in
`sales.kpi_alert_sent`. A month already closed is not swept retroactively.

The sweep starts nagging "about to miss" / "about to hit" only from day 16
(Vietnam time) of the running month, in every month. `ALERT_FROM_DAY = 16` is
a constant in the sweep's code, not configuration. It nags a (person × metric) only when the target used for
scoring is an approved personal line, except for team-wide metrics and metrics
that do not add up: the role target is the sum for the whole role, so it is not
a fair yardstick for one person.

The five bell kinds and the weight shipped (migration 0112 adds the kinds and
subjects to the `kind` / `subject_kind` CHECKs, policy included; 0115 restates
those lists with the kinds of 0110 and 0111 that 0112 had dropped):

| Kind                      | Weight (0093 §1) |
| ------------------------- | ---------------- |
| `kpi-target-allocated`    | important        |
| `kpi-allocation-returned` | important        |
| `kpi-counter-resolved`    | not important    |
| `kpi-about-to-miss`       | not important    |
| `kpi-about-to-hit`        | not important    |

"Gói chỉ tiêu bạn gửi bị trả lại" is important because the recipient has to
act (0093 §1).

The `kpi-target` subject is shared with 0093's `kpi-target-proposed` /
`kpi-target-agreed`. It opens with `kpi.view`, not `performance.view`, so a
holder without the performance screens still hears about their line. A code
`<period>:<role>` opens the role on "Đặt chỉ tiêu và duyệt"; a bare `<period>`
opens "Nhận chỉ tiêu".

### 4a · A role whose configuration is off falls back to the code default

A role without exactly one primary metric after the overlay is a bad
configuration. The reader falls back to the code default catalog and logs an
error; the KPI screen does not break. The configuration door stays usable.

### 4b · Who approves an allocation package stays as 0082 §5

Anyone holding `kpi.set-target` who is not the person who set the last number
may approve. "Only the director approves" is not built: the project owner kept
it as it is.

### 5 · History and contribution are read-only

Target version history (role and personal) is a read-only union of
`kpi_target` and `kpi_allocation`. A person's contribution is read-only and is
counted by exactly the definition the number reader uses, never by another rule.

### 6 · Out of scope (deferred, needs the project owner)

- The per-role "who proposes / who approves / acknowledgement deadline" flow.
  The server gates by permission today (`kpi.set-target`, two different
  people); moving to per-role is a change of the permission model.
- "Only the director approves" belongs to the same place (see §4b: kept as is).
- A manager–subordinate relation.

> Superseded by 0100: the acknowledgement deadline (§B) and a team lead relation
> (§D) are decided; "only the director approves" is not wanted. The team lead relation is built by 0101.

- The cap of 50 contribution records is a constant in code; the 1–99 / 2–100
  bounds and the slip < hit constraint on the two thresholds are registry
  defaults. None of these is a number the project owner has approved.

## Consequences

- New tables `kpi_role_metric` and `kpi_alert_sent`.
- 0098 §7's first and third bullets are done; its second stays open.
- `debriefs-closed` (0082 §3a) does not count a debrief closed as "Không liên
  lạc được": it counts only debriefs closed with a summary. This settles what
  0094 §5 left open.
