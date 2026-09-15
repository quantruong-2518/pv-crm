# 0022 · Contract amount is read from the customer-committed quote, never typed by hand; the mismatch override checkbox is rejected

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§2 · Bốn quyết định xương sống ·
2 · Tiền hợp đồng KHÔNG gõ tay — neo vào bản báo giá khách đã chốt" and
"§10 · Bốn chỗ bản nháp sai, đã sửa" item 3

## Context

An early draft screen proposed a "☑ Sign for a different amount than the
quote" escape-hatch checkbox on the contract-sign form.

## Decision

`ContractSign` drops `amount`/`currency` entirely. Signing means picking a
quote version that is in "customer committed" (`khach-chot`) status; the money
figure is read from that version. Wanting a different figure means making a
new version and committing that one instead — twenty seconds of extra work, in
exchange for "how much is this contract for" having exactly one source.

**The escape-hatch checkbox from the draft screen is rejected.** A single tick
box that allows a mismatch is enough to guarantee a mismatch happens: it will
get used exactly when things are rushed, and no screen will tell anyone it
happened. This is the same category of mistake the repo already refused once,
when it disallowed `opportunity` from having `state='won'`.

## Consequences

This closes off what the design calls "the second source of truth" for
contract money before it can exist. See ADR 0023 for how this is additionally
enforced at the table layer via a foreign key pinned to `quote_status =
'khach-chot'`, not left as a service-level convention.
