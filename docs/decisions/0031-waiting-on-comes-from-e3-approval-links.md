# 0031 · `waitingOn` is read from E3 approval links, not a twelfth state machine; four request types wired in order, gated by a `platform.approval` table

Status: accepted
Source: docs/tam-nhin-pipeline.md — "Ba câu chủ dự án chốt 31/08" (table),
"§4 · Quyết định 2 — nối E3, và ba bước chặn nhau"

## Context

The system had eleven separate state machines across three axes, and none of
them answers "who is this waiting on right now." The question for `waitingOn`
was whether to build a twelfth state machine or wire the answer through the
existing approval engine (E3), which already has a fully-built DI seam
(`config.approval.ts`) sitting deliberately unused, loudly refusing to run.

## Decision

**`waitingOn` is answered by connecting E3, not by building a new state
machine.** `config.approval.ts`'s docblock already specifies three steps, in
this exact order:

1. **Tables `platform.approval` + `approval_link`** (`ban-giao-db.md` cluster
   D). Placed under `platform`, not `sales`: the docblock text says
   `sales.approval`, and that conflict resolves in favor of `platform` because
   E3 is a platform-level engine, and approval requests point at objects from
   ANY branch, not only Sales.
2. **`APPROVALS` becomes a real provider** in
   `platform/engines/engines.module.ts` — today that module only supplies
   `ACCESS`. The token is already declared in `engines/tokens.ts`.
3. **`useClass` in `config.module.ts`** points at the real connector, and
   `SalesConfigService.apply()` runs once `state === 'approved'`.

The current `createApprovalEngine()` implementation keeps pending requests in
a process-lifetime `Map`. **Wiring the screen to that and returning 202 would
be lying to the user** — one deploy and every pending request vanishes. The
table comes first, no shortcut.

**Four request types, wired in this priority order:**

| Order | Type                                | Why it goes first                                                         | Approval chain                         |
| ----- | ----------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| 1     | `cấu-hình` (config)                 | The route is already built, only the storage is missing                   | dept head                              |
| 2     | `đổi-chủ-lead` (lead reassignment)  | Reassigning splits commission — `assign-menu.tsx` already logs the reason | dept head                              |
| 3     | `giảm-giá` (discount)               | Sits on the money path, and P5 (quote) is what generates it               | dept head → director if over threshold |
| 4     | `loại-lead` (lead disqualification) | Cannot be undone                                                          | dept head                              |

The decide permission already exists: `approval.decide`, held only by
`giám-đốc` (director) and `trưởng-phòng` (dept head). `proposeFromAi` requires
a `basis` — rule 9 enforced at the type layer, not left to the screen author's
good will.

**A new screen, `/hop-duyet` ("approval box"), reads `E3.pending(actor)`.**
Without this screen, "waiting" is a SENTENCE, not a STATE — the exact mistake
`assign-menu.tsx` already ripped out once, with the reason recorded there.

## Consequences

Three cross-cutting axes run in parallel across every phase regardless of this
decision: `TouchKind` (10 values, timeline), `ApprovalState` (E3 itself), and
`MailEngagementKind` (`OPEN`·`CLICK`·`UNSUBSCRIBE`, fully independent of
`MAIL_STATES`).
