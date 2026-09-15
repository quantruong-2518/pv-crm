# 0030 · Discount approval and contract term dates accepted into scope; e-signature deferred; invoicing, installed-asset tracking and post-sale tickets stay out of scope

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§12 · Đối chiếu sáu CRM lớn —
soát 31/08/2026", table "Sáu khối thị trường có mà bản này chưa nhắc" and its
six numbered notes

## Context

Cross-checking module 4 against six major CRMs (Dynamics 365, Zoho, Salesforce
CPQ/Revenue, SugarCRM, HubSpot, Odoo) surfaced six blocks of functionality the
design had not mentioned. Each was ranked and given a scope decision on
31/08/2026.

## Decision

PV One sits in the **manufacturing-ERP school** (Odoo, SAP — continuing on to
production and delivery), not the light-CRM school (HubSpot, Pipedrive — stop
at quote) or the classic-B2B school (Dynamics, Zoho, Sugar — quote → order →
invoice in one CRM). Data already says so: `sao-do.ts` already has
`LD-0334 → HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042`, and
`ObjectKind` in `packages/engines/src/types.ts` already reserves slots for
`SO`·`WO`·`PO`. **Concrete consequence: do not use HubSpot as the benchmark**
— it has neither a Contract nor an Order object, the exact two things this
chain needs, so any "HubSpot does it leaner" comparison is measuring against a
product solving a different problem.

Two decisions already in this design (see ADR 0021 and ADR 0020) are
confirmed as having market precedent, not invented in isolation: one-code-per-
quote-version matches Dynamics's "Revise" mechanism (and runs counter to
Odoo's single-record-with-state), and module 4 not creating the sales order
matches the boundary Odoo itself draws (the seller closes their document, the
supplier side picks it up).

Six blocks the design had not addressed, ranked by how worth building each is
for PV One (not by market popularity):

1. **Discount approval — accepted, goes into batch 3.** This is the single
   most valuable of the six, because the infrastructure already exists unused:
   Approval Process on Quote is Salesforce's canonical use case (discount past
   X% blocks sending until someone approves), and **E3 is already built and
   sitting idle.** The permission split in ADR 0026 (presales can edit, cannot
   send) touches this exact boundary but solves it with static role
   permissions rather than an approval step — and static permissions cannot
   distinguish "5% off" from "40% off." The `CK%` (discount percent) field
   already exists in the quote-composition modal with nobody gating it.
2. **Contract term dates — accepted, column addition at batch 0.**
   `ContractRow` today only knows the signing date:
   `code · opportunityCode · leadCode · amount · currency · signedAt · owner`
   — no start date, no end date, no term length. Salesforce's Contract object
   has `StartDate`·`EndDate`·`ContractTerm`·`OwnerExpirationNotice`. For an
   MES sold with annual maintenance, "which contracts are about to expire" is
   a real question with no column able to answer it today: the batch-4
   contract ledger (ADR 0028) can print "how much did we sign this month" but
   not "what expires next month."
3. **E-signature — deferred, pending debt #12.** The print → PDF → Drive-link
   workaround was chosen deliberately (see §7 of the source, folded into ADR
   0028's scope) because debt #12 is waiting on AWS. Not an oversight, but the
   clearest and first-worth-closing gap versus the market once file
   infrastructure lands.
4. **Invoicing and receivables — out of scope, Finance's territory.** The one
   thing to guard against: nobody should read batch 5 ("payment
   installments") as invoicing. **"Payment installments" is a contract-side
   milestone, NOT an invoice.**
5. **Installed-asset tracking — out of scope, a future service module.** For
   MES installed at a customer's factory, "which system is running where,
   which version, when does warranty end" is real data and the entry point
   for post-sale service. `ObjectKind` has no slot reserved for it yet — the
   day this opens, it opens in `packages/engines/src/types.ts` first.
6. **Post-sale ticketing — out of scope**, end of the chain, nobody has
   sketched it. A separate module, not module 4's job.

One block was checked against the market and confirmed correct to keep
excluded: **product catalog + price book.** Every CRM compared requires a
Product/Price Book before a quote can be built; ADR 0029's rejection stands —
for "Factory MES + One Plus" project-based selling with no SKUs, this is a
reason that holds up, not an avoided task.

## Consequences

As of the 31/08 cross-check, none of items 1–2 had shipped on the
`feat/module-4` worktree yet: `quote.service.ts:342` carried only a comment
noting discount approval "must be an approval step," with no E3 call wired;
`ContractRow` on that branch still had exactly the seven old columns plus
`quoteCode`, no term-date columns. Batch 0 for contract term dates had already
shipped (commit `2f085e5`) without them, meaning the addition now requires its
own separate migration rather than riding along with batch 0 — and the longer
it waits, the more it costs, since the contract ledger screen already reads
that table.
