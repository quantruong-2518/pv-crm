# 0032 · The opportunity board drops from five columns to three; "demoed" becomes an inferred flag, not a column

Status: accepted (the column set superseded by 0064: the board is five columns by the new stages, not three)
Source: docs/tam-nhin-pipeline.md — "Ba câu chủ dự án chốt 31/08" (table),
"§3 · Quyết định 1 — bảng cơ hội rút còn BA cột"

## Context

The opportunity board shows five columns (`stage`), but the server only ever
writes `stage` from `state` through `stageOfState`
(`opportunity.mapper.ts:99,150`), and that lookup table never returns `moi`
("new") or `da-demo` ("demoed"). Those two columns are not "lightly used" —
**no code path writes them**, and what sits in them is leftover seed data.

## Decision

**The board keeps three columns:**

| Column                        | Key          | Deadline | State feeding it |
| ----------------------------- | ------------ | -------- | ---------------- |
| Đang tìm hiểu ("exploring")   | `tim-hieu`   | 14 days  | `pending`        |
| Đã báo giá ("quoted")         | `da-bao-gia` | 30 days  | `gui-quotation`  |
| Chờ ký ("awaiting signature") | `cho-ky`     | 10 days  | `nego`           |

**"Demoed" is a real signal and dropping the column must not make it
disappear** — it moves, not vanishes: the demo event already has a home in
`MeetingRow` (`meeting.ts`) and touches `gap-lan-dau` ("first contact"). So
"demoed" becomes an **inferred flag** (`EXISTS(meeting)`) printed next to the
deal's name, not a column a deal gets dragged into.

**The "New" column's 2-day deadline is a real signal lost by this cut** — a
deal sitting in "New" loses that signal once columns are collapsed. The
intended repair is a first-stage deadline measured from `created_at` rather
than `stage_since` — left as an open question, see §8 below.

**Surface to change — 17 files, two tables.** `stage` is a column on both
`sales.lead:192` (with `lead_stage_idx`) and `sales.opportunity:99`. **No
`CHECK` constrains `stage` values** — only `opportunity_state_known`
constrains `state`. Consequence: the database will not raise a single
complaint; the break point is zod at READ time, i.e. a blank screen, not a
write-time error.

```
contracts   contracts/sales/enums.ts:23        StageKey drops to 3 values
            contracts/sales/opportunity.ts     STAGE_OF_STATE loses 2 rows
fixture     engines/fixtures/das-vina.ts:149   PIPELINE_STAGES · OPEN_DEALS · lead rows
server      opportunity.{mapper,labels,schema} · lead.schema · seed.ts:361 STATE_OF_STAGE
screens     data/{opportunities,leads,performance,plan,sales-config,lead-form}.ts
            components/ops-fields.tsx · pages/{leads,lead-detail}.tsx
```

**Migration — three SQL statements, no `DROP`:**

```sql
UPDATE sales.opportunity SET stage = 'tim-hieu' WHERE stage IN ('moi','da-demo');
UPDATE sales.lead        SET stage = 'tim-hieu' WHERE stage IN ('moi','da-demo');
DELETE FROM sales.config_entry WHERE list = 'STAGE' AND key IN ('moi','da-demo');
```

`stage_since` **stays as-is** — a clock already running is a real clock.

The opportunity side's row count is known in advance: the fixture has exactly
2 deals in `moi` and 2 in `da-demo` out of 10 open deals. The lead side
**must be counted on Neon before running** — the row count cannot be inferred
from the fixture. `config.repository.ts:93` already counts deals per `STAGE`
to block deleting a config row still in use, so the `DELETE` statement must
run AFTER the two `UPDATE` statements, never reordered.

## Consequences

The first-stage deadline question (`created_at` vs `stage_since`) is left
open — see ADR-adjacent open-decisions tracking, `tam-nhin-pipeline.md` §8
item 1.
