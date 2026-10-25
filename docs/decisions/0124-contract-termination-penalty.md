# 0124 · A terminated contract may carry one penalty, tracked at company level and outside every KPI

Status: accepted (amends 0107)
Source: project owner's decisions, 25/10/2026, asked one by one in chat.

## Context

0107 records a termination with a money snapshot (collected, refunded) and 0119 keeps the collected cash in
`collected-value`. Neither has a place for a penalty: the customer who withdrew and could not pay one, or the company
that could not deliver and owes one.

## Decision

### 1 · One penalty, one of two directions

A terminated contract may carry ONE penalty. The direction is chosen per termination:

- `customer-pays` ("Khách trả phạt"): the customer withdrew.
- `company-pays` ("Công ty trả phạt"): the company could not deliver.

### 2 · Tracked

The penalty is recorded at termination or added later. It stays pending until someone records the day the money moved
(`settled_on`, entered by the user, not the day of the entry). The whole amount at once; no partial payments.

### 3 · Company level only

The penalty is NOT in any KPI: not personal, not room. `collected-value` keeps 0119 unchanged, and the penalty never
folds into "kept" money (collected − refunded). A penalty is not sales.

### 4 · Model

Nullable columns on `sales.contract_termination` (migration 0146): `penalty_direction`, `penalty_amount` (> 0, in the
contract currency, NO cap against collected: a penalty may exceed what was paid), `penalty_settled_on` (date),
`penalty_settled_by_id`.

### 5 · Doors

- `POST /sales/contracts/:code/terminate` takes an optional `penalty`.
- New `PUT /sales/contracts/:code/penalty`, permission `contract.terminate` (head of sales and director). Only on a
  terminated contract: it is the one write allowed after termination (0107 §2 still answers 409 to the rest). The
  collected / refunded snapshot is untouched. Audited with the old and the new value, since the columns are
  overwritten in place. The settled day may not be in the future. A contract with no currency takes no penalty (409):
  it would convert to NULL VND and drop out of the report's sums unseen.

### 6 · Report

`GET /sales/contracts/summary` (unscoped, company numbers) gains the terminated count and, per direction, the total and
the settled sum, in VND by the rate table. The contract book header shows a "Hợp đồng đã chấm dứt và tiền phạt" band under the four
existing cards; clicking it opens the terminated tab.

### 7 · Notification

No new bell kind. The existing `contract-terminated` bell still rings on termination but says nothing about the
penalty; a penalty added, changed or settled later is silent.

### 8 · Deploy order

Migrate before the API deploy, web after the API.

## Rejected

- **(a) A child table**: one penalty per termination, and the owner asked for the same model as the termination.

## Open

Questions 120–123 in `open-questions.md`.
