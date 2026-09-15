# 0023 · Quote and contract money invariants are enforced at the Postgres table layer, not trusted to service memory

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§2 · Bốn quyết định xương sống ·
4 · Cưỡng chế ở tầng BẢNG, không nhờ service nhớ" and "§3 · Dữ liệu" (all
subsections), "§10" item 1, "§11 · Năm câu treo · 1 · Cột ghim `quote_status`
— GIỮ"

## Context

Three money invariants exist across `sales.quote` and `sales.contract`: one
opportunity has one contract; one opportunity has at most one committed
(`khach-chot`) quote version; a contract may only point at a committed quote
version, and that version can never be un-committed afterward. The question is
whether Postgres constraints enforce these, or whether application code has to
remember to.

## Decision

All three invariants get Postgres guard rails, not code discipline.

**`sales.quote`** — one row per code per version:

```sql
UNIQUE (opportunity_code, version)
UNIQUE INDEX ... ON quote(opportunity_code) WHERE status='khach-chot'   -- at most ONE committed version
UNIQUE (code, status)                                                    -- the seat for contract's FK, below
CHECK  quote_status_known                                                -- same pattern as opportunity_state_known
CHECK  (sent_at IS NULL) = (status = 'nhap')
```

`status` values: `nhap` ("draft") · `da-gui` ("sent") · `khach-chot`
("customer committed") · `khach-tu-choi` ("customer declined") · `thay-the`
("superseded"). **An old version flips to `thay-the` at the moment the new
version is SENT, not at the moment it is created** — abandoning a half-written
draft must not kill the version the customer is currently holding.

**There is no `het-han` ("expired") status.** Expiry is `valid_until < today`,
computed at read time. Storing it as a stored state would rebuild the exact
`days_here` mistake `ban-giao-db.md` already fixed once: a number that changes
with time frozen into a column.

`version` is **not** derived from the code — `BG-5002` could be version 2 of
this deal or version 1 of a different one, because the code sequence is
system-wide, not per-deal. It is `max(version)+1` within the same
`opportunity_code`, assigned at creation, inside a transaction.

**`sales.quote_code_seq` starts at 5001**, and with the "one code per version"
shape (ADR 0021) it burns through numbers faster than any other sequence in
the system — which makes the starting point matter more, not less. Reasoning
is not hypothetical: `seed.ts:488` loads `dasVina.objects` into
`platform.object`, and that list contains `BG-1077` (`das-vina.ts:46`). A
sequence starting at 1 would collide with that exact mirrored row — the same
reason the opportunity-code and contract-code sequences both start at 5001.
The `BG` code fits the existing `ObjectCode` primitive, no new primitive
needed (unlike `ContractCode`, which had to be split off for the `Đ`
character).

**`sales.quote_line`** — `line_total` is a **GENERATED** column, because the
formula only reads columns on the same row:

```sql
line_total bigint GENERATED ALWAYS AS (
  round(round(qty * unit_price * (1 - discount_pct/100)) * (1 + vat_pct/100))
) STORED
```

Rounding happens in **two tiers, each to the whole currency unit**: the
customer hand-adds the printed "line total" column, and the machine-printed
grand total must match that hand-addition. Summing first and rounding once
would drift by a few units, and a few units on a billion-đồng document is a
phone call.

**VAT is applied per LINE, not per document.** Software licenses carry 10% VAT
while training may differ; line-level VAT subsumes document-level (setting the
same % on every line), document-level cannot be un-collapsed back to per-line.

The four `quote` total columns (`subtotal`, `discount_total`, `vat_total`,
`total`) are **written by the service inside the same transaction** every time
a line on a `nhap` (draft) version changes — a cross-row `SUM` is something a
`GENERATED` column cannot express. Not computed at read time: the number on a
contract must be the number frozen at commit, not a number recalculated every
time somebody opens a screen.

**`sales.contract` foreign key**, bridging to the money source:

```sql
ALTER TABLE contract ADD COLUMN quote_code   text NULL;   -- 6 old contracts have no quote behind them
ALTER TABLE contract ADD COLUMN quote_status text DEFAULT 'khach-chot' NULL;

FOREIGN KEY (quote_code, quote_status) REFERENCES quote (code, status)
CHECK  (quote_status IS NULL OR quote_status = 'khach-chot')
UNIQUE (opportunity_code)     -- pays down fix-later.md debt #10
```

Because the quote code alone is already the primary key, the foreign key only
needs **two** columns instead of three — one place the "one code per version"
shape gives design something back.

**The `quote_status` column always carries exactly one value on purpose.** It
turns "a committed quote can never be un-committed" into Postgres's problem:
moving `quote.status` away from `khach-chot` while a contract still points at
it raises `23503`, not a bug waiting to be noticed by a human. The price is
one constant-valued column; the payoff is that the money path has nowhere left
to drift. There is no Drizzle risk here — `contract.schema.ts` already has a
foreign key composed against a non-primary-key pair
(`opportunity(code, lead_code)`), so this shape is already expressible, not
something to be tested for feasibility.

**All three new contract columns are nullable, on purpose.** Six old contracts
(`HĐ-2711…2716`) have no quote behind them, and their `amount` **is genuinely
NULL today on Neon**. Backfilling a retroactive quote with a made-up unit
price to satisfy a `NOT NULL` is exactly what the fixture already refuses in
writing: "making up a contract value here is making up revenue"
(`das-vina.ts`). New rows always get the service filling every column in —
schema permitting NULL does not mean the write path is allowed to leave it
blank.

`amount`/`currency` are **kept** on `contract` as a snapshot at signing time.
This is a copy of a VALUE, a shape the repo is normally wary of — but it
cannot drift, because the source quote is FK-pinned immobile and the service
copies it inside the same transaction. To audit: `contract.amount ≠
quote.total` of the version it points at is a one-row `SELECT`.

**`sales.contract_payment_term`** stores amount, not percentage — see ADR 0024.

## Consequences

The cost of the pinned `quote_status` column is one constant-valued column and
one unique index. Dropping it would leave "a contract may only point at a
committed quote" living only in service code — the exact shape of debt #10
(`fix-later.md`), currently suspected of miscounting in production, this time
on money. The design deliberately keeps paying this price.
