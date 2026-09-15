# 0024 · `sales.contract_payment_term` stores an amount, not a percentage

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§3 · Dữ liệu ·
`sales.contract_payment_term` — đợt thanh toán"

## Context

A contract's payment schedule needs to be stored: how many installments, how
much each, when due.

## Decision

Store the **amount**, not a percentage — percentage is something derived at
print time. This is the _collection plan_ living inside the contract
document, part of module 4; _actually collecting the money_ is Finance's job,
a later module.

`SUM(amount) = contract.amount` cannot be enforced with a `CHECK` (a `CHECK`
cannot see other rows) — the service checks it, and that is a named debt, not
a place anyone forgot about.

## Consequences

None recorded beyond the debt noted above.
