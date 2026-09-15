# 0033 · Quote (P5) is drawn into the 8-phase pipeline chain, not left as a gap

Status: accepted
Source: docs/tam-nhin-pipeline.md — "Ba câu chủ dự án chốt 31/08" (table),
"§1 · Chuỗi 8 phase, và phase KHÔNG phải module", "§5 · Quyết định 3 — báo giá
vào pipeline luôn"

## Context

Module 4 (quote/contract) was designed separately (`tam-nhin-bao-gia-hop-
dong.md`). The question for the system-wide pipeline view was whether to draw
it as part of the same 8-phase chain or leave it out as a gap to fill in
later.

## Decision

**Yes — all 8 phases are drawn, no gap left.** The full chain:

```
P0 SOURCE      SR-/SK-   what pulled the customer in           ─┐
P1 CAMPAIGN    CP-       what was sent, to whom, which round     ┴─ module 1
P2 INTAKE      —         a lead is created, how trustworthy      ─┐
P3 NURTURE     LD-       tiered up or dropped                    ┴─ module 2
P4 OPPORTUNITY OP-       three columns, has money, has a date     ── module 3
P5 QUOTE       BG-       which version, which one the customer committed to ─┐
P6 CONTRACT    HĐ-       signed = a row exists                    ┴─ module 4
P7 HAND-OFF    SO/WO/PO  outside the Sales boundary               ── Supply branch
```

A lead walks the full chain, but **not sequentially**: P1 repeats throughout
P3 (each mail round is one loop), and P0 sticks to the lead permanently,
rather than being "passed through."

`quote.status` (`nhap → da-gui → { khach-chot | khach-tu-choi | thay-the }`,
already decided in `tam-nhin-bao-gia-hop-dong.md`; see ADR 0023 for the
constraint shape) has no `het-han` value — expiry is `valid_until < today`,
computed at read time. At most ONE `khach-chot` version per opportunity,
enforced by the unique index in ADR 0023.

**Consequence flagged for P4, not resolved here:** today
`stage='da-bao-gia'` only means "somebody clicked the Send button." Once P5
exists, it _should_ mean `EXISTS(quote WHERE status='da-gui')` — the column
would then match the actual document instead of matching a button click. This
specific remapping is **left open**, not decided in this pass — see
`tam-nhin-pipeline.md` §8 item 2.

## Consequences

Module numbering after module 4 is inserted (already decided in ADR 0020):
Performance → 5, Plan → 6, Settings → 7.
