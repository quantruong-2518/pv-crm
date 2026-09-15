# 0025 · `sales/quote.ts` in `@pv/contracts` stays a leaf module, imported only one direction

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§4 · Hợp đồng zod"

## Context

A new file, `packages/contracts/src/sales/quote.ts`, needs a place in the
import graph relative to `contract.ts`.

## Decision

`packages/contracts/src/sales/quote.ts` is deliberately a **leaf**: it only
imports `../primitives` and `./enums`. `contract.ts` imports **additionally**
from `./quote`, one direction only. The reverse would be a module-load dead
cycle — precisely what already happened for real with `ContractCode`, which
had to be moved out to `primitives.ts` (recorded in `ban-giao-co-hoi.md`,
round three).

```ts
QuoteStatus = z.enum(['nhap', 'da-gui', 'khach-chot', 'khach-tu-choi', 'thay-the'])
QuoteLineRow   { lineNo, description, unit, qty, unitPrice, discountPct, vatPct, lineTotal }
QuoteLineDraft = QuoteLineRow.omit({ lineTotal: true })   // server computes, client never sends it
QuoteRow       { code, version, opportunityCode, leadCode, status, currency, title, note,
                 validUntil, subtotal, discountTotal, vatTotal, total,
                 sentAt, decidedAt, createdAt, lines }
QuoteDraft     { title, note, validUntil, currency, lines: min(1) }

ContractRow   += quoteCode                        // nullable, only NULL on the 6 old rows
ContractSign   { signedAt?, ownerId? }            // amount/currency dropped — see ADR 0022
ContractTermRow / ContractTermDraft               // payment installments
```

## Consequences

None recorded beyond avoiding the circular-import failure mode already seen
once with `ContractCode`.
