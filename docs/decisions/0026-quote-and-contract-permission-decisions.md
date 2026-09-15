# 0026 · Quote/contract permissions: five new grants not six, presales can edit but not send, and `KIND_DOMAIN` must be patched for `BG`/`HĐ`

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§5 · Cửa và quyền" (both tables
and "Một lỗ hổng đang mở, phải vá TRƯỚC khi sổ hợp đồng lên"), "§10" item 4,
"§11 · Năm câu treo · 3 · Presales — SỬA ĐƯỢC, GỬI THÌ KHÔNG"

## Context

Module 4 needed new routes and a decision on how many new permissions those
routes require, and who on the sales side gets which.

## Decision

**Five new permissions, not six**: `quote.view` · `báo-giá.sửa` (quote.edit) ·
`báo-giá.gửi` (quote.send) · `contract.view` · `contract.edit`.

**Recording "customer committed" reuses the existing `opportunity.close`
permission — it does not get its own `báo-giá.chốt`.** The hand that commits a
version is the same hand that decides the amount that will get signed —
binding both actions to one permission describes reality accurately, and
removes one row from the permission matrix.

| Role                 | quote.view/edit | quote.send | contract.view/edit |
| -------------------- | --------------- | ---------- | ------------------ |
| director · dept head | yes             | yes        | yes                |
| sale                 | yes             | yes        | yes                |
| presales             | **yes**         | no         | no                 |
| bd · marketing       | no              | no         | no                 |

**Presales can edit, not send** (`quote.view` + `báo-giá.sửa`, no
`báo-giá.gửi`). The boundary here is not "who is allowed to calculate" but
**"who is allowed to talk to the customer."** Presales builds numbers and runs
demos — `ContractSign`'s own docblock already says so — but the customer
relationship belongs to the deal owner. This mirrors presales already having
`opportunity.edit` without `opportunity.close`, and the edit/send split has
precedent already in the repo: `campaign.edit` and `campaign.broadcast`.

Route table:

| Route                                      | Permission          | Scoped | Note                                                       |
| ------------------------------------------ | ------------------- | ------ | ---------------------------------------------------------- |
| `GET /sales/quotes`                        | `quote.view`        | yes    | ledger, cuts across every opportunity                      |
| `GET /sales/quotes/:code`                  | `quote.view`        | yes    | one version, plus every sibling version for comparison     |
| `POST /sales/quotes`                       | `báo-giá.sửa`       | **†**  | `opportunityCode` is in the body, not the path             |
| `PATCH /sales/quotes/:code`                | `báo-giá.sửa`       | yes    | 409 if already sent — editing over what the customer holds |
| `POST /sales/quotes/:code/replace`         | `báo-giá.sửa`       | yes    | spawns off this version, **mints a new code**, chains edge |
| `POST /sales/quotes/:code/send`            | `báo-giá.gửi`       | yes    | 409 if the contact has no email                            |
| `POST /sales/quotes/:code/decide`          | `opportunity.close` | yes    | customer commits / declines — see permission note above    |
| `GET /sales/contracts`                     | `contract.view`     | yes    | contract ledger                                            |
| `POST /sales/opportunities/:code/contract` | `opportunity.close` | yes    | **existing route, body changed** — no longer takes money   |
| `POST · PATCH .../contracts/:code/terms`   | `contract.edit`     | yes    | payment installments                                       |

**†** `POST /sales/quotes` cannot be scoped (no `ref` to check against yet)
but **must check the parent OPPORTUNITY's scope in the service layer**.
Skipping this lets an `ownOnly` sale build a quote on someone else's deal — no
other gate catches it.

**An open security hole must be patched BEFORE the contract ledger ships.**
`KIND_DOMAIN` in `packages/engines/src/e2-access.ts` only maps `LD→lead` and
`OP→opportunity`. `HĐ` has no domain, so `permissionFor()` returns `null`, and
`can()` falls back to a license-only check — **the role axis is skipped
entirely for the contract object kind**, while the sign route has been writing
`amount` into the `platform.object` mirror row since 26/08. Nobody can exploit
this today because `GraphService` is not wired to any controller yet, but the
contract screen is exactly what will wire it. The fix is two lines:
`BG: 'báo-giá'`, `HĐ: 'hợp-đồng'`.

This **overrides decision #6 of `ban-giao-db.md`** ("keep the permission
matrix as-is, add no new permissions"), and deliberately so: that decision was
about lead/campaign, where a missing permission only leaks internal
information. Here a missing permission leaks **every signed contract's
amount** to a role that should not see it.

## Consequences

None recorded beyond overriding `ban-giao-db.md` decision #6 for this specific
case, as explained above.
