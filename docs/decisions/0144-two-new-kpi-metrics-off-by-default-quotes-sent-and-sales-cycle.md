# 0144 · Two new KPI metrics, off by default: quotes sent and sales cycle

Status: accepted (reverses 0082 §8 on quote count; extends 0099 §1)
Source: project owner's choices in chat, 10/11/2026 (after a review of KPI against modern CRMs).

## Context

0082 §8 said quote count was unmeasurable for lack of a quote table; `sales.quotation` now exists. The overlay
(0099 §1) could only switch off metrics of a role's code default.

## Decision

Add both to the catalog, off by default, switched on through the existing KPI config approval. Current scorecards are
unchanged.

## Defaults that are not the owner's

1. Roles: `sale` and `account-executive`.
2. `quotes-sent`: count of `sales.quotation` rows with `created_by` = the actor and `sent_at` in the month, lead alive
   via the deal. Rows with no author (backfill) are not counted. Activity layer, paced.
3. `sales-cycle-days`: median days from `opportunity.created_at` to the deal's first contract `signed_at`, for deals
   whose first contract is signed in the month, contract not terminated. Credited to that contract's `owner_id`
   (same credit as `signed-value`, 0113). Conversion layer, lower is better, not paced, not reconciled after close
   (a median, 0115 §3).
4. A default-off metric cannot be the primary. The fallback to the code catalog on a bad config (0099 §4a) leaves
   default-off metrics off.
5. Known limit: editing a backfill quotation makes the editor its author (`patch` in the quotation service), so it
   then counts for them.

## Consequences

- `KPI_DEFAULT_OFF` lists the two metrics.
- Migration 0164 widens seven metric CHECKs. Migrate before deploy.
