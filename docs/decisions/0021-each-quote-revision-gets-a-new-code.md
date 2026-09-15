# 0021 · Each quote revision gets a brand-new code and chains as a list, not siblings off the opportunity

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§2 · Bốn quyết định xương sống ·
1 · MỖI BẢN MỘT MÃ RIÊNG — chủ dự án chốt 30/08", "§6 · E1 và E4" (edge shape),
and "§10 · Bốn chỗ bản nháp sai, đã sửa" item 2

## Context

When a customer asks for a discount, does the next quote revision reuse the
same code with a new `version` number, or get an entirely new code? The
project owner ratified "new code" on 30/08 — reversing an earlier draft
position that had argued for reusing the code.

## Decision

`BG-5001` is the first version; if the customer asks for a discount, the next
version is `BG-5002`, an entirely new code. The `version` column is only a
display ordinal ("version 2") for the human reader, not a key. An old version
is **never `UPDATE`d** — it stays as-is with status `thay-the` ("superseded").

**Why not update in place:** `BG-5001` has already left the system — it is in
a letter the customer is holding, in an E1 edge, in a `sales.touch` row.
Editing it in place means the paper the customer holds and the row in the
database silently diverge, with nobody committing anything.

**What this buys, beyond the customer being able to cite exactly one number
for exactly one sheet of paper:** the mail `event_key` is automatically
distinct per version. If one code carried multiple versions, the key
`<flow>/<audience>/v1/<code>` would collide between two sends, and
`onConflictDoNothing` would **silently swallow the second letter** — no error,
no log, the customer gets nothing. This shape kills that trap without adding a
rule.

**What is knowingly given up:** the code sequence jumps ahead with every round
of negotiation — one deal that goes through three rounds burns three codes.
This is the exact thing `contract_code_seq` was once split off from
`opportunity_code_seq` to avoid, and here it is traded for the immutability of
a letter already sent.

**Forced consequence: E1 edges must form a CHAIN, not a set of siblings.**

```
right:  OP-5001 → BG-5001 → BG-5002 → HĐ-5001
wrong:  OP-5001 → BG-5001
        OP-5001 → BG-5002 → HĐ-5001        (two edges both starting from OP)
```

The reason is concrete, read from `packages/engines/src/e1-object-graph.ts:76-84`:
`story()` walks every path from the root, picks the **longest** path
containing the code currently open, and on a tie breaks **by code order**. A
sibling shape means that before signing, the two versions are equally-long
leaves — the tie-break picks the smaller code, i.e. ContextRail draws the
**OLD, already-superseded** version while the new one is the one actually
alive. A chain shape means the path always grows toward the newest version, so
the rail is deterministic and the negotiation history reads intact.

Edge writing responsibility: `OP → BG` only for the first version of a deal;
`BG → BG` links a replacement to the version it replaces, **not** back to
`OP`; `BG → HĐ` is written inside the sign transaction. The edge kind used is
`'sinh-ra'` (already declared). The write method belongs in `platform/graph`,
**not** hand-written inside `branches/sales` — per the existing warning in
`opportunity.service.ts`'s docblock.

## Consequences

Rail length grows with the number of negotiation rounds — accepted as the
price of "one code per version". If a deal one day has six versions and the
chip row overflows, the fix is a **rail component change** (collapse the
middle), not dropping edges — dropping edges would erase history at the data
layer to fix a layout problem. The 30/08 ratification also returned two things
an earlier draft had missed: the contract's foreign key drops to two columns
instead of three (see ADR 0023), and the mail `event_key` collision trap
disappears without needing a new rule.
