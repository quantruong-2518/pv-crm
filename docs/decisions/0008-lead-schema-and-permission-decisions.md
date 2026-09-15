# 0008 · Six schema decisions for `sales.lead` / `campaign_member` / E2 permissions

Status: accepted
Source: docs/ban-giao-db.md — table "Seven decisions locked in", rows #2–#7
(row #1 — email on `lead` — split out to ADR 0001, superseded by ADR 0002)

## Context

Data schema, cut 26/08/2026, after the main flow relocked: campaigns
**consume** existing leads, they do not produce leads — the `campaign`↔`lead`
relationship is n:m through `campaign_member`.

## Decision

| #   | Decision                                                           | The deciding reason                                                                                                                                                                 |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | **`campaign_member` is frozen** at add-time                        | Firing it again a 2nd, 3rd time still targets the chosen list, and who received what stays traceable. A dynamic segment means two sends produce two different lists                 |
| 3   | **Lead → opportunity is 1-n**                                      | One company buys more than once. The old `lead.deal_code` column implicitly assumed 1-1, meaning a second purchase had to create a duplicate lead with the same company, same email |
| 4   | **Three columns `NOT NULL`**: `company` · `contact_name` · `email` | The main flow is MAS mail; a lead with no email cannot take part in that flow. Enforced at the column, not the form — every entry point is one form                                 |
| 5   | **20 profile fields are real columns**, not `jsonb`                | `budget`, `deadline`, `headcount`, `tax_code` will all be filtered on and reported on. JSONB is where indexing and type constraints disappear exactly where they are needed         |
| 6   | **Keep the E2 permission matrix as is**, no new permissions        | Prioritizes ease of use and matching the system already running. The known consequence is recorded in the "Debt" section of `docs/ban-giao-db.md`                                   |
| 7   | **Neon is the primary DB, even during dev**                        | `apps/api/.env` points straight at Neon. `pglite://` is still on the line right above it, commented out                                                                             |

## Consequences

Decision #4 (three `NOT NULL` columns) is the foundation for the optional
`email` boundary on `sales.contact` in ADR 0002 — the LEAD's rule still holds,
the contact only describes the real person in more detail.
